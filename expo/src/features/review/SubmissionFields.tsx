import { FiChevronDown } from 'react-icons/fi';
import type { Doc } from '@clearpath/backend/convex/_generated/dataModel';
import { products, channels } from './model';
import './selection.css';

type Context = {
  title?: string;
  product?: Doc<'reviews'>['product'];
  channel?: Doc<'reviews'>['channel'];
  jurisdictions: string[];
  offerTerms: string;
  goLiveDate: string;
  notes: string;
};
export const emptyContext: Context = {
  title: undefined,
  jurisdictions: ['US'],
  offerTerms: '',
  goLiveDate: '',
  notes: '',
};
const productKeys = ['personal_loan', 'credit_card', 'mortgage_prequalification'] as const;
const channelKeys = [
  'social',
  'search',
  'display',
  'email',
  'sms',
  'landing_page',
  'affiliate',
  'video_audio',
  'print',
  'other',
] as const;
const states =
  'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(
    ' ',
  );
export function SubmissionFields({
  value,
  onChange,
}: {
  value: Context;
  onChange: (next: Context) => void;
}) {
  const set = (patch: Partial<Context>) => onChange({ ...value, ...patch });
  const national = value.jurisdictions.includes('US');
  return (
    <section className="cp-form-section">
      <div className="cp-fields">
        <label>
          Title
          <input required value={value.title} onChange={(e) => set({ title: e.target.value })} />
        </label>
        <div>
          <span className="cp-field-label" id="product-label">
            Product
          </span>
          <div className="cp-product-options" role="radiogroup" aria-labelledby="product-label">
            {productKeys.map((key, index) => (
              <button
                type="button"
                key={key}
                role="radio"
                id={`product-${key}`}
                aria-checked={value.product === key}
                tabIndex={value.product === key || (!value.product && index === 0) ? 0 : -1}
                onKeyDown={(event) => {
                  const direction =
                    event.key === 'ArrowRight' || event.key === 'ArrowDown'
                      ? 1
                      : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                        ? -1
                        : 0;
                  const next =
                    event.key === 'Home'
                      ? productKeys[0]
                      : event.key === 'End'
                        ? productKeys[2]
                        : direction
                          ? productKeys[
                              (index + direction + productKeys.length) % productKeys.length
                            ]
                          : undefined;
                  if (next) {
                    event.preventDefault();
                    set({ product: next });
                    document.getElementById(`product-${next}`)?.focus();
                  }
                }}
                onClick={() => set({ product: key })}
              >
                <span className="cp-radio-dot" aria-hidden="true" />
                {products[key]}
              </button>
            ))}
          </div>
        </div>
        <div className="cp-fields two">
          <label>
            Channel
            <span className="cp-field-select">
              <select
                required
                value={value.channel ?? ''}
                onChange={(e) =>
                  set({ channel: channelKeys.find((key) => key === e.target.value) })
                }
              >
                <option value="" disabled>
                  Choose a channel
                </option>
                {channelKeys.map((key) => (
                  <option key={key} value={key}>
                    {channels[key]}
                  </option>
                ))}
              </select>
              <FiChevronDown aria-hidden="true" />
            </span>
          </label>
          <label>
            Where it runs
            <span className="cp-field-select">
              <select
                value={national ? 'national' : 'states'}
                onChange={(e) =>
                  set({ jurisdictions: e.target.value === 'national' ? ['US'] : [] })
                }
              >
                <option value="national">National</option>
                <option value="states">Specific states</option>
              </select>
              <FiChevronDown aria-hidden="true" />
            </span>
          </label>
        </div>
        {!national && (
          <div>
            <span className="cp-field-label">
              States <small>{value.jurisdictions.length} selected</small>
            </span>
            <div className="cp-state-picker" role="group" aria-label="Select states">
              {states.map((state) => (
                <button
                  key={state}
                  className="cp-button"
                  type="button"
                  aria-pressed={value.jurisdictions.includes(state)}
                  onClick={() =>
                    set({
                      jurisdictions: value.jurisdictions.includes(state)
                        ? value.jurisdictions.filter((s) => s !== state)
                        : [...value.jurisdictions, state],
                    })
                  }
                >
                  {state}
                </button>
              ))}
            </div>
          </div>
        )}
        <label>
          Offer terms <small>Optional</small>
          <textarea
            rows={2}
            value={value.offerTerms}
            onChange={(e) => set({ offerTerms: e.target.value })}
            placeholder="APR range, fees, amounts, promotional terms"
          />
        </label>
        <label>
          Go-live date <small>Optional</small>
          <input
            type="date"
            value={value.goLiveDate}
            onChange={(e) => set({ goLiveDate: e.target.value })}
          />
        </label>
        <label>
          Notes for the reviewer <small>Optional</small>
          <textarea rows={3} value={value.notes} onChange={(e) => set({ notes: e.target.value })} />
        </label>
      </div>
    </section>
  );
}
