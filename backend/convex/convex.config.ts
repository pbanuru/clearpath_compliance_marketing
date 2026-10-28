import { defineApp } from 'convex/server';
import { v } from 'convex/values';

export default defineApp({ env: { WORKOS_CLIENT_ID: v.string() } });
