server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already busy.`);
    console.error('  Windows: taskkill /F /IM node.exe');
    console.error('  Or PowerShell: $env:PORT=3001; npm start\n');
    process.exit(1);
  }

  console.error('Server error:', err);
  process.exit(1);
});

async function startServer() {
  try {
    console.log('\nStarting FoodWise...');
    console.log(`Port: ${PORT}`);
    console.log(`Mode: ${LOCAL_MODE ? 'LOCAL' : 'CLOUD'}`);

    await connectMongo();

    console.log(
      LOCAL_MODE
        ? 'Local JSON storage ready ✅'
        : 'MongoDB connected ✅'
    );

    const HOST = '0.0.0.0';

    server.listen(PORT, HOST, () => {
      console.log('\n  FoodWise Pro v21 · Profile + Firebase + MongoDB ✅');

      console.log(`  Listening: http://${HOST}:${PORT}`);
      console.log(`  Health:    http://${HOST}:${PORT}/api/health`);

      console.log(
        `  Mode:      ${
          LOCAL_MODE
            ? 'LOCAL · JSON storage · login gate enabled'
            : `CLOUD · MongoDB ${MONGODB_DB_NAME}`
        }`
      );

      console.log(
        `  Firebase Auth: ${
          LOCAL_MODE
            ? 'local login active · Firebase skipped'
            : firebaseConfigured()
              ? 'configured ✅'
              : 'not configured'
        }`
      );

      console.log(
        `  Gemini Chat: ${
          GEMINI_API_KEY
            ? 'configured ✅'
            : 'local fallback active'
        }`
      );

      console.log(
        `  Cloudflare Images: ${
          cloudflareConfigured()
            ? 'configured ✅'
            : 'optional / local assets active'
        }`
      );

      console.log('\n  Server is ready to accept connections ✅\n');
    });

  } catch (err) {
    console.error('\n❌ FoodWise startup failed');
    console.error(err?.stack || err?.message || err);
    process.exit(1);
  }
}

async function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Closing FoodWise...`);

  try {
    if (mongoClient) {
      await mongoClient.close();
      console.log('MongoDB connection closed.');
    }
  } catch (err) {
    console.error('Shutdown error:', err.message);
  } finally {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();