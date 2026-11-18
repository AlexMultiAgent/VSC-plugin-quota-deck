export function activityIconFailure(entries) {
  return entries.includes('media/activity-bar.svg')
    ? undefined
    : 'media/activity-bar.svg is not shipped';
}
