import { defineApp } from 'convex/server';
import { v } from 'convex/values';
import r2 from '@convex-dev/r2/convex.config';

const app = defineApp({
  env: {
    WORKOS_CLIENT_ID: v.string(),
    OPENAI_API_KEY: v.optional(v.string()),
    R2_BUCKET: v.string(),
    R2_ENDPOINT: v.string(),
    R2_ACCESS_KEY_ID: v.string(),
    R2_SECRET_ACCESS_KEY: v.string(),
  },
});
app.use(r2);
export default app;
