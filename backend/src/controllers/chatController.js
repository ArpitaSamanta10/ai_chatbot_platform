import { OpenAI } from 'openai';
import { z } from 'zod';
import supabase from '../config/supabase.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const messageSchema = z.object({
  message: z.string().min(1, 'Message is required').max(1000, 'Message must be at most 1000 characters'),
});

// Helper: Detect booking intent
const detectBookingIntent = (message) => {
  const bookingKeywords = ['book', 'trip', 'plan', 'travel', 'package', 'tour', 'booking'];
  const lowerMessage = message.toLowerCase();
  return bookingKeywords.some(keyword => lowerMessage.includes(keyword));
};

// Helper: Parse lead details from message
const parseLeadDetails = (message) => {
  const details = {
    name: null,
    email: null,
    phone: null,
    destination: null,
  };

  // Simple regex patterns for extraction
  const nameMatch = message.match(/(?:name\s+is\s+|i'm\s+|i am\s+)([A-Za-z\s]+?)(?:\,|and|email|$)/i);
  if (nameMatch) details.name = nameMatch[1].trim();

  const emailMatch = message.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) details.email = emailMatch[1];

  const phoneMatch = message.match(/(?:phone|contact|number)?\s*(\d{10}|\d{3}-\d{3}-\d{4}|\+\d{1,3}\d{9,})/);
  if (phoneMatch) details.phone = phoneMatch[1];

  const destinationMatch = message.match(/(?:to\s+|destination\s+|trip\s+to\s+|visit\s+)([A-Za-z\s]+?)(?:\,|for|$)/i);
  if (destinationMatch) details.destination = destinationMatch[1].trim();

  return details;
};

// Helper: Check if lead details are complete
const hasLeadDetails = (details) => {
  return details.name && details.email && (details.destination || details.phone);
};

export const sendMessage = async (req, res) => {
  try {
    console.log('BODY:', req.body);

    // Validate message with Zod
    const validationResult = messageSchema.safeParse(req.body);
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(err => err.message);
      return res.status(400).json({ error: errors[0] });
    }

    const tenantId = req.tenantId || req.body.tenantId;
    const { message, conversationId } = req.body;
    console.log('TENANT:', tenantId);
    console.log('MESSAGE:', message);
    console.log('CONVERSATION_ID:', conversationId);

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    // Detect booking intent
    const hasBookingIntent = detectBookingIntent(message);
    console.log('BOOKING INTENT:', hasBookingIntent);

    if (hasBookingIntent) {
      // Parse lead details
      const leadDetails = parseLeadDetails(message);
      console.log('LEAD DETAILS:', leadDetails);

      if (hasLeadDetails(leadDetails)) {
        // Lead details are complete - save to leads table
        console.log('Saving lead to database...');
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

        if (leadError) throw leadError;
        console.log('Lead saved successfully');

        return res.json({
          success: true,
          data: {
            conversationId,
            reply: "Thanks! Our travel expert will contact you shortly.",
            isLead: true,
          },
          error: null,
        });
      } else {
        // Incomplete lead details - ask for more info
        return res.json({
          success: true,
          data: {
            conversationId,
            reply: "Great! I'd love to help you plan your trip. Could you please provide: your name, email, and destination you're interested in?",
            isLeadCollection: true,
          },
          error: null,
        });
      }
    }

    // No booking intent - proceed with regular chat flow
    // Create new conversation if needed
    let activeConversationId = conversationId;
    if (!activeConversationId) {
      const { data: newConversation, error: convError } = await supabase
        .from('conversations')
        .insert([{ tenant_id: tenantId }])
        .select('id')
        .single();

      if (convError) throw convError;
      activeConversationId = newConversation.id;
    }

    // Save user message
    console.log('Saving user message...');
    const { error: userMsgError } = await supabase
      .from('messages')
      .insert([
        {
          conversation_id: activeConversationId,
          role: 'user',
          content: message,
        },
      ]);

    if (userMsgError) throw userMsgError;
    console.log('User message saved');

    // Fetch all messages for this conversation (ordered by created_at)
    console.log('Fetching conversation history...');
    const { data: conversationHistory, error: historyError } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', activeConversationId)
      .order('created_at', { ascending: true });

    if (historyError) throw historyError;
    console.log('HISTORY:', conversationHistory);

    // Build messages array for OpenAI (map role and content)
    const messagesForOpenAI = conversationHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Send message to OpenAI
    console.log('Calling OpenAI with', messagesForOpenAI.length, 'messages...');
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messagesForOpenAI,
    });

    const aiMessage = response.choices[0].message.content;
    console.log('AI RESPONSE:', aiMessage);

    // Save AI response
    console.log('Saving AI response...');
    const { error: aiMsgError } = await supabase
      .from('messages')
      .insert([
        {
          conversation_id: activeConversationId,
          role: 'assistant',
          content: aiMessage,
        },
      ]);

    if (aiMsgError) throw aiMsgError;
    console.log('AI response saved');

    // Return response
    return res.json({
      success: true,
      data: {
        conversationId: activeConversationId,
        reply: aiMessage,
      },
      error: null,
    });
  } catch (error) {
    console.error('CHAT ERROR:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const getHistory = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    console.log('Fetching history for tenant:', tenantId);

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    // Fetch all conversations for this tenant
    const { data: conversations, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (convError) throw convError;
    console.log('Found', conversations.length, 'conversations');

    // Fetch messages for each conversation
    const history = await Promise.all(
      conversations.map(async (conv) => {
        const { data: messages, error: msgError } = await supabase
          .from('messages')
          .select('role, content, created_at')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: true });

        if (msgError) throw msgError;

        return {
          conversationId: conv.id,
          messages,
        };
      })
    );

    console.log('HISTORY_RESPONSE:', history);
    res.json(history);
  } catch (error) {
    console.error('HISTORY ERROR:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
