import supabase from "../config/supabase.js";

export const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized",
    });
  }

  const token = authHeader.slice(7);

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    console.error('AUTH ERROR: Invalid user from token:', error?.message);
    return res.status(401).json({
      success: false,
      error: "Unauthorized",
    });
  }

  console.log("TOKEN USER:", data.user.id);

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", data.user.id)
    .single();

  if (profileError) {
    console.error('PROFILE ERROR:', profileError.message);
    return res.status(400).json({
      success: false,
      error: "User profile not found",
    });
  }

  if (!profileData || !profileData.tenant_id) {
    console.error('PROFILE DATA missing:', profileData);
    return res.status(400).json({
      success: false,
      error: "Tenant ID not found in profile",
    });
  }

  console.log('PROFILE:', profileData);
  console.log('TENANT ID:', profileData.tenant_id);
  req.user = data.user;
  req.tenantId = profileData.tenant_id;
  next();
};
