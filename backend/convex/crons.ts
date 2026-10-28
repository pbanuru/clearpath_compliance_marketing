import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';
const crons = cronJobs();
// eslint-disable-next-line @convex-dev/no-top-of-hour-crons -- Product requirement: daily at 06:00 UTC.
crons.daily('Check policy sources', { hourUTC: 6, minuteUTC: 0 }, internal.policy.monitor.run, {});
export default crons;
