import type { Doc } from '../_generated/dataModel';
import type { Content, MediaContext } from './mediaInput';
import { callOpenAI, outputText, readableError } from './openai';
import { outputSchema } from './output';
import { parseAnalysis, record, isRecord, string } from './parsing';
import { frameTool, getVideoFrames, MAX_TOOL_FRAMES, MAX_TOOL_ROUNDS } from './frameTools';
import type { ToolUsage } from './frameTools';

export async function reviewWithFrames(args: {
  context: MediaContext;
  content: Content[];
  instructions: string;
  assets: Doc<'assets'>[];
  previous: Doc<'findings'>[];
  usage: ToolUsage;
}) {
  const { context, assets, usage } = args;
  const input: unknown[] = [{ role: 'user', content: args.content }];
  const hasVideo = assets.some((a) => a.kind === 'video');
  for (;;) {
    const stopped =
      usage.frameToolRounds >= MAX_TOOL_ROUNDS || usage.frameToolFrames >= MAX_TOOL_FRAMES;
    if (stopped) usage.frameToolCeilingHit = true;
    const next = await callOpenAI({
      key: context.key,
      model: 'gpt-6.1-sol',
      operation: 'review',
      spans: context.spans,
      body: JSON.stringify({
        model: 'gpt-6.1-sol',
        reasoning: { effort: 'high' },
        store: false,
        include: ['reasoning.encrypted_content'],
        instructions:
          args.instructions +
          (hasVideo
            ? '\nVideo layers are separate evidence: transcript words, visual timeline, and actual frames. Inspect additional frames with get_video_frames whenever useful, including the start/end of on-screen text. You may request as many useful frames as needed within the 10-round/48-frame runaway-loop guard. Timeline timing is a model observation, not proof of continuous readability.'
            : ''),
        input,
        ...(hasVideo ? { tools: [frameTool], tool_choice: stopped ? 'none' : 'auto' } : {}),
        text: {
          format: {
            type: 'json_schema',
            name: 'clearpath_review',
            strict: true,
            schema: outputSchema,
          },
        },
      }),
      parse: (body) => {
        const obj = record(body);
        if (!Array.isArray(obj.output) || (obj.status !== undefined && obj.status !== 'completed'))
          throw new Error('OpenAI review did not complete.');
        const output: unknown[] = obj.output;
        const calls = output
          .filter((item: unknown) => isRecord(item) && item.type === 'function_call')
          .map(record);
        if (calls.length) {
          if (stopped || !hasVideo)
            throw new Error('OpenAI returned a tool call after tools were disabled.');
          return { calls, output, result: null };
        }
        return {
          calls: [],
          output,
          result: parseAnalysis(outputText(body), assets, args.previous, context.texts),
        };
      },
    });
    if (next.result) return next.result;
    usage.frameToolRounds++;
    input.push(...next.output);
    for (const call of next.calls) {
      let output: Content[];
      try {
        if (call.name !== 'get_video_frames') throw new Error('Unknown review tool.');
        output = await getVideoFrames(string(call.arguments), assets, context, usage);
      } catch (error) {
        output = [{ type: 'input_text', text: readableError(error) }];
      }
      input.push({ type: 'function_call_output', call_id: string(call.call_id), output });
    }
  }
}
