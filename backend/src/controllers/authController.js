import jwt from 'jsonwebtoken';
import supabase from '../config/supabase.js';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordMinLength = 6;
const jwtSecret = process.env.JWT_SECRET || 'dev-jwt-secret-change-me';

const signToken = ({ id, email, tenantId }) =>
  jwt.sign({ id, email, tenantId }, jwtSecret, {
    expiresIn: '7d',
  });

const validateAuthInput = (email, password) => {
  if (!email || !password) {
    return 'Email and password are required';
  }

  if (!emailRegex.test(email)) {
    return 'Please enter a valid email address';
  }

  if (password.length < passwordMinLength) {
    return `Password must be at least ${passwordMinLength} characters`;
  }

  return null;
};

const ensureTenantAndProfile = async (user) => {
  const { data: existingProfile, error: profileLookupError } = await supabase
    .from('profiles')
    .select('id, email, tenant_id')
    .eq('id', user.id)
    .maybeSingle();

  if (profileLookupError) {
    throw new Error(`Failed to fetch profile: ${profileLookupError.message}`);
  }

  if (existingProfile?.tenant_id) {
    return {
      profile: existingProfile,
      tenantId: existingProfile.tenant_id,
      created: false,
    };
  }

  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .insert([{ name: `${user.email}'s workspace` }])
    .select('id, name')
    .single();

  if (tenantError) {
    throw new Error(`Failed to create workspace: ${tenantError.message}`);
  }

  if (existingProfile) {
    const { data: updatedProfile, error: updateError } = await supabase
      .from('profiles')
      .update({
        email: user.email,
        tenant_id: tenant.id,
      })
      .eq('id', user.id)
      .select('id, email, tenant_id')
      .single();

    if (updateError) {
      throw new Error(`Failed to update profile: ${updateError.message}`);
    }

    return {
      profile: updatedProfile,
      tenantId: tenant.id,
      created: true,
    };
  }

  const { data: profile, error: profileInsertError } = await supabase
    .from('profiles')
    .insert([
      {
        id: user.id,
        email: user.email,
        tenant_id: tenant.id,
      },
    ])
    .select('id, email, tenant_id')
    .single();

  if (profileInsertError) {
    throw new Error(`Failed to create profile: ${profileInsertError.message}`);
  }

  return {
    profile,
    tenantId: tenant.id,
    created: true,
  };
};

export const signup = async (req, res) => {
  const { email, password } = req.body ?? {};
  console.log('Signup request:', { email });

  const validationError = validateAuthInput(email, password);
  if (validationError) {
    return res.status(400).json({
      success: false,
      error: validationError,
    });
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      const statusCode = /already registered|already exists/i.test(error.message) ? 409 : 400;
      return res.status(statusCode).json({
        success: false,
        error: error.message,
      });
    }

    if (!data?.user) {
      return res.status(500).json({
        success: false,
        error: 'Signup did not return a user',
      });
    }

    const { profile, tenantId } = await ensureTenantAndProfile(data.user);
    const token = signToken({ id: data.user.id, email: data.user.email, tenantId });

    return res.status(201).json({
      success: true,
      data: {
        user: {
          id: data.user.id,
          email: data.user.email,
          tenantId,
        },
        profile,
      },
      user: {
        id: data.user.id,
        email: data.user.email,
        tenantId,
      },
      token,
    });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({
      success: false,
      error: 'An error occurred during signup',
    });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body ?? {};
  console.log('Login request:', { email });

  const validationError = validateAuthInput(email, password);
  if (validationError) {
    return res.status(400).json({
      success: false,
      error: validationError,
    });
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
      });
    }

    if (!data?.user) {
      return res.status(401).json({
        success: false,
        error: 'Unable to authenticate user',
      });
    }

    const { profile, tenantId } = await ensureTenantAndProfile(data.user);
    const token = signToken({ id: data.user.id, email: data.user.email, tenantId });

    return res.status(200).json({
      success: true,
      data: {
        user: {
          id: data.user.id,
          email: data.user.email,
          tenantId,
        },
        profile,
      },
      user: {
        id: data.user.id,
        email: data.user.email,
        tenantId,
      },
      token,
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({
      success: false,
      error: 'An error occurred during login',
    });
  }
};
