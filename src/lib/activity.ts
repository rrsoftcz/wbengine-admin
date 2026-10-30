/** Audit event categories of the profile activity list; shared by the server query and the page. */
export const activityCategories = ['signin', 'account', 'sites'] as const;
export type ActivityCategory = (typeof activityCategories)[number];

/** Category of an audit event, used for the badge next to each entry. */
export function activityCategory(event: string): ActivityCategory | 'other' {
    if (['login.password', 'login.mfa', 'logout'].includes(event))
        return 'signin';
    if (/^(password|mfa)\./.test(event) || event === 'recovery.issued' || event === 'profile.locale')
        return 'account';
    if (/^(site|grant|invite)\./.test(event))
        return 'sites';
    return 'other';
}
