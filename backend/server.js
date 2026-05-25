import dotenv from 'dotenv';
dotenv.config();

import app from './src/app.js';

const PORT = 5000;

app.listen(PORT, () => {
  console.log('Server running on port 5000');
  console.log(`Frontend should connect to http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

  if (!process.env.JWT_SECRET) {
    console.warn('JWT_SECRET is not set. Using the development fallback secret.');
  }
});
