import Settings from '../models/Settings.model.js';

export async function isLeadEmailsEnabled() {
  const settings = await Settings.findById('global').lean();
  return settings?.leadEmailsEnabled === true;
}

export async function setLeadEmailsEnabled(enabled) {
  return Settings.findByIdAndUpdate(
    'global',
    { $set: { leadEmailsEnabled: !!enabled } },
    { upsert: true, new: true }
  ).lean();
}
