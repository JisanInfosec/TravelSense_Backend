import { createApp } from './bootstrap.js';

async function bootstrap() {
  const app = await createApp({ enableShutdownHooks: true });
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  console.log(`TravelSense API listening on http://localhost:${port}/api`);
}
await bootstrap();
