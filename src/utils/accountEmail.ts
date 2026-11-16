// Аккаунты из Steam/GitHub без почты получают служебный адрес вида steam_…@oauth.local.
// Показывать его нельзя, а такому пользователю стоит напомнить привязать настоящую почту.

export const realEmail = (email?: string | null) => (email && !/@oauth\.local$/i.test(email) ? email : '');

export const needsEmail = (email?: string | null) => !realEmail(email);
