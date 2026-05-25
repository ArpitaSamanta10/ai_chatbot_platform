import supabase from "../config/supabase.js";

export const signup = async (req, res) => {
  const { email, password } = req.body;

  // Validate inputs
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password are required',
    });
  }

  console.log('SIGNUP ATTEMPT:', { email });

  try {
    // Step 1: Create auth user
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      console.error('AUTH SIGNUP ERROR:', error.message);
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    const user = data.user;
    console.log('AUTH USER CREATED:', { userId: user.id });

    // Step 2: Create tenant
    const { data: tenantData, error: tenantError } = await supabase
      .from("tenants")
      .insert([{ name: `${email}'s workspace` }])
      .select()
      .single();

    if (tenantError) {
      console.error('TENANT CREATION ERROR:', tenantError.message);
      return res.status(500).json({
        success: false,
        error: `Failed to create workspace: ${tenantError.message}`,
      });
    }

    console.log('TENANT CREATED:', { tenantId: tenantData.id });

    // Step 3: Create user profile linked to tenant
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .insert([
        {
          id: user.id,
          email: user.email,
          tenant_id: tenantData.id,
        },
      ])
      .select()
      .single();

    if (profileError) {
      console.error('PROFILE CREATION ERROR:', profileError.message);
      return res.status(500).json({
        success: false,
        error: `Failed to create profile: ${profileError.message}. Note: Check that RLS is disabled on profiles table.`,
      });
    }

    console.log('PROFILE CREATED:', { userId: user.id, tenantId: tenantData.id });
    console.log('SIGNUP SUCCESS');

    res.status(201).json({
      success: true,
      message: "Account created successfully",
      data: {
        user: {
          id: user.id,
          email: user.email,
        },
        session: data.session,
        tenant: tenantData,
      },
    });
  } catch (err) {
    console.error('SIGNUP EXCEPTION:', err.message);
    res.status(500).json({
      success: false,
      error: 'An error occurred during signup',
    });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;

  // Validate inputs
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password are required',
    });
  }

  console.log('LOGIN ATTEMPT:', { email });

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('SUPABASE AUTH ERROR:', error.message);
      return res.status(401).json({
        success: false,
        error: error.message,
      });
    }

    // Verify we have a session with access token
    if (!data?.session?.access_token) {
      console.error('NO ACCESS TOKEN IN RESPONSE');
      return res.status(401).json({
        success: false,
        error: 'Failed to obtain access token',
      });
    }

    const user = data.user;
    console.log('LOGIN SUCCESS:', { userId: user.id });

    // ===== AUTO-CREATE PROFILE & TENANT IF MISSING =====
    console.log('CHECKING PROFILE:', { userId: user.id });

    const { data: profile, error: profileCheckError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileCheckError || !profile) {
      console.log('PROFILE NOT FOUND - CREATING TENANT & PROFILE');

      // Create tenant
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .insert([
          {
            name: `${user.email}'s workspace`,
          },
        ])
        .select()
        .single();

      if (tenantError) {
        console.error('AUTO-TENANT CREATION ERROR:', tenantError.message);
        return res.status(500).json({
          success: false,
          error: `Failed to create workspace: ${tenantError.message}`,
        });
      }

      console.log('AUTO-TENANT CREATED:', { tenantId: tenant.id });

      // Create profile
      const { error: profileInsertError } = await supabase
        .from('profiles')
        .insert([
          {
            id: user.id,
            email: user.email,
            tenant_id: tenant.id,
          },
        ]);

      if (profileInsertError) {
        console.error('AUTO-PROFILE CREATION ERROR:', profileInsertError.message);
        return res.status(500).json({
          success: false,
          error: `Failed to create profile: ${profileInsertError.message}`,
        });
      }

      console.log('AUTO-PROFILE CREATED:', { userId: user.id, tenantId: tenant.id });
    } else {
      console.log('PROFILE ALREADY EXISTS:', { userId: user.id });
    }
    // ===== END AUTO-CREATE =====

    res.json({
      success: true,
      data: {
        session: data.session,
        user: data.user,
      },
    });
  } catch (err) {
    console.error('LOGIN ERROR:', err.message);
    res.status(500).json({
      success: false,
      error: 'An error occurred during login',
    });
  }
};
