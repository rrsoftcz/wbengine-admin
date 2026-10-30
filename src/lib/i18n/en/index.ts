import app from './app.ts';
import auth from './auth.ts';
import sites from './sites.ts';
import content from './content.ts';
import fields from './fields.ts';
import errors from './errors.ts';
import analytics from './analytics.ts';
import profile from './profile.ts';

/** English source catalog. Each area owns one file; the key prefix is the area name. */
const en = { ...app, ...auth, ...sites, ...content, ...fields, ...errors, ...analytics, ...profile } satisfies Record<string, string>;
export default en;
