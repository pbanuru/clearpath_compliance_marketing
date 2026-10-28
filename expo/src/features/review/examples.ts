import type { Doc } from '@clearpath/backend/convex/_generated/dataModel';
import type { useAssetUploads } from '@/features/assets/useAssetUploads';

type Example = {
  id: string;
  title: string;
  format: string;
  product: Doc<'reviews'>['product'];
  channel: Doc<'reviews'>['channel'];
  files: { path: string; name?: string }[];
  offerTerms?: string;
  notes?: string;
};
export const examples: Example[] = [
  {
    id: 'personal-loan-social',
    title: 'Personal loan social ad',
    format: 'Image + caption',
    product: 'personal_loan',
    channel: 'social',
    files: [
      { path: 'personal-loan-social-ad.png' },
      { path: 'personal-loan-social-caption.txt', name: 'Caption' },
    ],
    offerTerms: 'APR 5.99%–35.99%; loans $2,000–$50,000; terms 24–60 months.',
  },
  {
    id: 'credit-card-email',
    title: 'Credit card offer email',
    format: 'Email copy',
    product: 'credit_card',
    channel: 'email',
    files: [{ path: 'credit-card-email.txt', name: 'Email' }],
  },
  {
    id: 'mortgage-landing-page',
    title: 'Mortgage landing page',
    format: 'PDF',
    product: 'mortgage_prequalification',
    channel: 'landing_page',
    files: [{ path: 'mortgage-landing-page.pdf' }],
  },
  {
    id: 'affiliate-video',
    title: 'Affiliate creator video',
    format: 'Video',
    product: 'personal_loan',
    channel: 'affiliate',
    files: [{ path: 'affiliate-video.mp4' }],
    notes: 'Posted by an affiliate partner on their social account.',
  },
];
export async function uploadExample(
  files: Example['files'],
  uploads: ReturnType<typeof useAssetUploads>,
) {
  const ids = [];
  for (const item of files) {
    const response = await fetch(`/examples/${item.path}`);
    if (!response.ok || response.headers.get('Content-Type')?.includes('text/html'))
      throw new Error('This example is not available yet. Please try again shortly.');
    if (item.path.endsWith('.txt'))
      ids.push(await uploads.addText(item.name ?? item.path, await response.text()));
    else
      ids.push(
        ...(await uploads.upload(
          [
            new File([await response.blob()], item.path, {
              type: response.headers.get('Content-Type') ?? 'application/octet-stream',
            }),
          ],
          { isolated: true },
        )),
      );
  }
  return ids;
}
