import { OpenAI } from 'openai';
import { z } from 'zod';
import supabase from '../config/supabase.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const sendMessageSchema = z.object({
  message: z.string().min(1, 'Message is required').max(1000, 'Message must be at most 1000 characters'),
  conversationId: z.string().uuid().optional().nullable(),
});

const renameSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(120, 'Title must be at most 120 characters'),
});

const pinSchema = z.object({
  is_pinned: z.boolean(),
});

const detectBookingIntent = (message) => {
  const bookingKeywords = ['book', 'trip', 'plan', 'travel', 'package', 'tour', 'booking'];
  const lowerMessage = message.toLowerCase();
  return bookingKeywords.some((keyword) => lowerMessage.includes(keyword));
};

const parseLeadDetails = (message) => {
  const details = {
    name: null,
    email: null,
    phone: null,
    destination: null,
  };

  const nameMatch = message.match(/(?:name\s+is\s+|i'm\s+|i am\s+)([A-Za-z\s]+?)(?:,|and|email|$)/i);
  if (nameMatch) details.name = nameMatch[1].trim();

  const emailMatch = message.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) details.email = emailMatch[1];

  const phoneMatch = message.match(/(?:phone|contact|number)?\s*(\d{10}|\d{3}-\d{3}-\d{4}|\+\d{1,3}\d{9,})/);
  if (phoneMatch) details.phone = phoneMatch[1];

  const destinationMatch = message.match(/(?:to\s+|destination\s+|trip\s+to\s+|visit\s+)([A-Za-z\s]+?)(?:,|for|$)/i);
  if (destinationMatch) details.destination = destinationMatch[1].trim();

  return details;
};

const hasLeadDetails = (details) => details.name && details.email && (details.destination || details.phone);

const verifyConversationOwnership = async (conversationId, tenantId) => {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, tenant_id')
    .eq('id', conversationId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

const buildConversationTitle = (message) => {
  const normalized = message.trim().replace(/\s+/g, ' ');
  return normalized.length > 60 ? `${normalized.slice(0, 57)}...` : normalized;
};

const isMissingTableColumnError = (error, columnName) =>
  error?.message?.toLowerCase().includes(columnName.toLowerCase()) ||
  error?.details?.toLowerCase().includes(columnName.toLowerCase());

export const sendMessage = async (req, res) => {
  try {
    console.log('Send message request:', req.body);

    const validationResult = sendMessageSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: validationResult.error.issues[0]?.message || 'Invalid input',
      });
    }

    const tenantId = req.tenantId;
    const { message, conversationId } = validationResult.data;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID is required',
      });
    }

    const hasBookingIntent = detectBookingIntent(message);

    if (hasBookingIntent) {
      const leadDetails = parseLeadDetails(message);

      if (hasLeadDetails(leadDetails)) {
        const { error: leadError } = await supabase.from('leads').insert([
          {
            tenant_id: tenantId,
            name: leadDetails.name,
            email: leadDetails.email,
            phone: leadDetails.phone || null,
            destination: leadDetails.destination,
            message,
            source: 'chatbot',
          },
        ]);

        if (leadError) {
          throw leadError;
        }

        return res.status(200).json({
          success: true,
          data: {
            conversationId,
            reply: 'Thanks! Our travel expert will contact you shortly.',
            isLead: true,
          },
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          conversationId,
          reply:
            "Great! I'd love to help you plan your trip. Could you please provide: your name, email, and destination you're interested in?",
          isLeadCollection: true,
        },
      });
    }

    let activeConversationId = conversationId ?? null;

    if (activeConversationId) {
      const existingConversation = await verifyConversationOwnership(activeConversationId, tenantId);
      if (!existingConversation) {
        return res.status(404).json({
          success: false,
          error: 'Conversation not found',
        });
      }
    }

    if (!activeConversationId) {
      const conversationPayload = {
        tenant_id: tenantId,
        title: buildConversationTitle(message),
      };

      let createConversation = await supabase
        .from('conversations')
        .insert([conversationPayload])
        .select('id')
        .single();

      if (createConversation.error && isMissingTableColumnError(createConversation.error, 'title')) {
        createConversation = await supabase
          .from('conversations')
          .insert([{ tenant_id: tenantId }])
          .select('id')
          .single();
      }

      if (createConversation.error) {
        throw createConversation.error;
      }

      activeConversationId = createConversation.data.id;
    }

    const { error: userMessageError } = await supabase.from('messages').insert([
      {
        conversation_id: activeConversationId,
        role: 'user',
        content: message,
      },
    ]);

    if (userMessageError) {
      throw userMessageError;
    }

    const { data: conversationHistory, error: historyError } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', activeConversationId)
      .order('created_at', { ascending: true });

    if (historyError) {
      throw historyError;
    }

    const messagesForOpenAI = conversationHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messagesForOpenAI,
    });

    const aiMessage = response.choices[0]?.message?.content?.trim() || 'I can help with that destination!';

    const { error: aiMessageError } = await supabase.from('messages').insert([
      {
        conversation_id: activeConversationId,
        role: 'assistant',
        content: aiMessage,
      },
    ]);

    if (aiMessageError) {
      throw aiMessageError;
    }

    return res.status(200).json({
      success: true,
      data: {
        conversationId: activeConversationId,
        reply: aiMessage,
      },
    });
  } catch (error) {
    console.error('Chat sendMessage error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to send message',
    });
  }
};

export const getHistory = async (req, res) => {
  try {
    const tenantId = req.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID is required',
      });
    }

    const { data: conversations, error: conversationsError } = await supabase
      .from('conversations')
      .select('id')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (conversationsError) {
      throw conversationsError;
    }

    const history = await Promise.all(
      conversations.map(async (conversation) => {
        const { data: messages, error: messagesError } = await supabase
          .from('messages')
          .select('role, content, created_at')
          .eq('conversation_id', conversation.id)
          .order('created_at', { ascending: true });

        if (messagesError) {
          throw messagesError;
        }

        return {
          conversationId: conversation.id,
          messages,
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error('Chat getHistory error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch history',
    });
  }
};

export const getConversations = async (req, res) => {
  try {
    const tenantId = req.tenantId;

    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    const enrichedConversations = await Promise.all(
      conversations.map(async (conversation) => {
        const { data: lastMessage, error: lastMessageError } = await supabase
          .from('messages')
          .select('content, created_at')
          .eq('conversation_id', conversation.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastMessageError) {
          throw lastMessageError;
        }

        return {
          id: conversation.id,
          title: conversation.title || lastMessage?.content || 'New Chat',
          is_pinned: Boolean(conversation.is_pinned),
          created_at: conversation.created_at || lastMessage?.created_at || new Date().toISOString(),
          updated_at: conversation.updated_at || lastMessage?.created_at || conversation.created_at,
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: enrichedConversations,
    });
  } catch (error) {
    console.error('Chat getConversations error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch conversations',
    });
  }
};

export const getConversationMessages = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    const conversation = await verifyConversationOwnership(id, tenantId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found',
      });
    }

    const { data: messages, error } = await supabase
      .from('messages')
      .select('role, content, created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    return res.status(200).json({
      success: true,
      data: messages,
    });
  } catch (error) {
    console.error('Chat getConversationMessages error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch messages',
    });
  }
};

export const renameConversation = async (req, res) => {
  try {
    const validationResult = renameSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: validationResult.error.issues[0]?.message || 'Invalid input',
      });
    }

    const tenantId = req.tenantId;
    const { id } = req.params;
    const conversation = await verifyConversationOwnership(id, tenantId);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found',
      });
    }

    const { data, error } = await supabase
      .from('conversations')
      .update({ title: validationResult.data.title })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Chat renameConversation error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to rename conversation',
    });
  }
};

export const pinConversation = async (req, res) => {
  try {
    const validationResult = pinSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: validationResult.error.issues[0]?.message || 'Invalid input',
      });
    }

    const tenantId = req.tenantId;
    const { id } = req.params;
    const conversation = await verifyConversationOwnership(id, tenantId);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found',
      });
    }

    const { data, error } = await supabase
      .from('conversations')
      .update({ is_pinned: validationResult.data.is_pinned })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Chat pinConversation error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to pin conversation',
    });
  }
};

export const deleteConversation = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    const conversation = await verifyConversationOwnership(id, tenantId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found',
      });
    }

    const { error: deleteMessagesError } = await supabase.from('messages').delete().eq('conversation_id', id);
    if (deleteMessagesError) {
      throw deleteMessagesError;
    }

    const { error: deleteConversationError } = await supabase
      .from('conversations')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (deleteConversationError) {
      throw deleteConversationError;
    }

    return res.status(200).json({
      success: true,
      data: { id },
    });
  } catch (error) {
    console.error('Chat deleteConversation error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete conversation',
    });
  }
};
