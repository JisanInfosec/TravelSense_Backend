import { createApp } from '../dist/bootstrap.js';

let handlerPromise;

async function createHandler() {
  const app = await createApp();
  await app.init();
  return app.getHttpAdapter().getInstance();
}

export default async function handler(request, response) {
  try {
    handlerPromise ??= createHandler();
    const expressHandler = await handlerPromise;
    expressHandler(request, response);
  } catch (error) {
    handlerPromise = undefined;
    console.error('Failed to initialize TravelSense API function', error);
    if (!response.headersSent) {
      response.statusCode = 500;
      response.setHeader('Content-Type', 'application/json');
      response.end(
        JSON.stringify({
          statusCode: 500,
          message: 'API initialization failed',
        }),
      );
    }
  }
}
