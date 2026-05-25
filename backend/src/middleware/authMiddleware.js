import jwt from 'jsonwebtoken';
import supabase from '../config/supabase.js';

const jwtSecret = process.env.JWT_SECRET || 'dev-jwt-secret-change-me';

export const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'No token',
    });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, tenant_id')
      .eq('id', decoded.id)
      .maybeSingle();

    if (profileError) {
      console.error('Auth profile lookup error:', profileError.message);
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    if (!profile?.tenant_id) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    req.user = {
      id: decoded.id,
      email: decoded.email || profile.email,
    };
    req.tenantId = profile.tenant_id;

    next();
  } catch (error) {
    console.error('JWT verification error:', error.message);
    return res.status(401).json({
      success: false,
      error: 'Invalid token',
    });
  }
};
