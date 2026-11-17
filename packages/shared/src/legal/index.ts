/**
 * Legal texts shown in the apps (Account → Terms / Privacy) and on the public website (apps/site).
 * One source so the wording never drifts. Plain data: no React Native imports, so the web site can use it too.
 *
 * DRAFT — written for HomeCare's actual features, but NOT reviewed by a lawyer. Have them reviewed and fill in
 * SUPPORT_CONTACT before the pilot launch.
 */

export const LEGAL_UPDATED = '17 November 2026';

/** Replace before launch, e.g. an email address and a WhatsApp number. */
export const SUPPORT_CONTACT = '[support contact — to be added before launch]';

export type LegalSection = { heading: string; paragraphs?: string[]; bullets?: string[] };
export type LegalDoc = { id: LegalDocId; title: string; intro: string; sections: LegalSection[] };
export type LegalDocId = 'terms' | 'privacy' | 'delete-account';

const terms: LegalDoc = {
  id: 'terms',
  title: 'Terms of Service',
  intro:
    'These terms explain how HomeCare works and the rules for using it. By creating an account you agree to them. If you do not agree, please do not use HomeCare.',
  sections: [
    {
      heading: '1. What HomeCare is',
      paragraphs: [
        'HomeCare is an app that connects customers in Islamabad and Rawalpindi with independent riders, who run errands such as buying groceries or medicine, and independent skilled workers ("ustaads"), who come to the customer\'s home.',
        'Riders and ustaads are independent partners, not HomeCare employees. HomeCare verifies their identity before they can accept work, but the work itself is done by them.',
      ],
    },
    {
      heading: '2. Who can use HomeCare',
      bullets: [
        'You must be at least 18 years old.',
        'You sign in with your own Pakistani mobile number and must keep access to it.',
        'You must give true information, including your name and addresses.',
        'One person, one account. You are responsible for what happens in your account.',
      ],
    },
    {
      heading: '3. Errand orders (Sauda Run)',
      bullets: [
        'You describe what you need and, if you like, the shop to buy it from. The rider buys it with their own money and brings it to you.',
        'You pay the rider in cash on delivery: the actual cost shown on the bill photo plus the delivery fee shown in the app.',
        'The app shows an estimated delivery fee when you order. The final fee depends on the distance from the shop to your address and is shown when the rider reaches the shop.',
        'If an item is not available, the rider may suggest a substitute. Only approved substitutes are bought.',
        'There is a limit on how much a rider can pay at a shop. For bigger orders you may need to pay the shop directly.',
      ],
    },
    {
      heading: '4. Cancelling an order',
      bullets: [
        'Cancelling is free while HomeCare is still looking for a rider.',
        'After a rider accepts, a small cancellation fee may apply. The current fee is shown before you confirm.',
        'Once the rider has reached the shop, contact support to cancel. You may have to pay for items already bought.',
      ],
    },
    {
      heading: '5. Home services (Ustaad)',
      paragraphs: [
        'When home services open, an ustaad visit may carry a visit fee. The ustaad sends a quote in the app (labour and parts separately), and work starts only after you approve it. Warranty terms are shown with each booking.',
      ],
    },
    {
      heading: '6. Things you may not order',
      bullets: [
        'Anything illegal in Pakistan, including drugs, weapons and alcohol.',
        'Prescription medicines without a valid prescription.',
        'Items that are dangerous to carry, or that the rider would need a licence to transport.',
      ],
    },
    {
      heading: '7. Respect and safety',
      paragraphs: [
        'Treat riders and ustaads with respect, and expect the same from them. Harassment, threats or fraud lead to suspension of the account. Report any problem to HomeCare support.',
      ],
    },
    {
      heading: '8. Partners (riders and ustaads)',
      bullets: [
        'Partners must give a valid CNIC, a real selfie and true details, and keep their verification up to date.',
        'HomeCare may reject an application or suspend a partner, with a reason, for example after complaints or false documents.',
        'Partners are responsible for their own vehicle, tools, conduct and the quality of their work.',
      ],
    },
    {
      heading: '9. Our responsibility',
      paragraphs: [
        'We work to keep HomeCare available and safe, but we cannot promise that a rider or ustaad will always be available, or that the app will never have errors. To the extent the law allows, HomeCare is not responsible for indirect losses. Problems with an order should be reported in the app or to support within 7 days so we can look into them.',
      ],
    },
    {
      heading: '10. Ending your account',
      paragraphs: [
        'You can delete your account at any time from Account → Delete account. We may suspend or close accounts that break these terms.',
      ],
    },
    {
      heading: '11. Changes and law',
      paragraphs: [
        'We may update these terms. If the changes are important, we will tell you in the app before they apply. These terms are governed by the laws of Pakistan.',
        `Questions: ${SUPPORT_CONTACT}.`,
      ],
    },
  ],
};

const privacy: LegalDoc = {
  id: 'privacy',
  title: 'Privacy Policy',
  intro:
    'This policy explains what information HomeCare collects, why, who can see it, and how you can delete it. We collect only what the service needs.',
  sections: [
    {
      heading: '1. Information we collect',
      bullets: [
        'Account: your mobile number, name, optional email and app language.',
        'Addresses: the places you save, including the map location, house and street details, landmarks, directions and, if you book for someone else, their name and number.',
        'Orders: what you order, list photos you add, the shop, bill photos, prices, status history and your rating.',
        'Partners: CNIC number, CNIC photos, a selfie, vehicle details, trades, payout wallet number, and the phone\'s location while online.',
        'Places you search for on the map, which are sent to the map search service.',
      ],
    },
    {
      heading: '2. Why we use it',
      bullets: [
        'To sign you in and keep your account secure.',
        'To deliver orders and services: matching you with a nearby partner, showing them where to go and how much to charge.',
        'To verify partners\' identity and keep customers safe.',
        'To handle support requests, disputes and fraud.',
        'To understand which areas need the service (for example, the waitlist).',
      ],
      paragraphs: ['We do not sell your information, and we do not use it for advertising.'],
    },
    {
      heading: '3. Who can see it',
      bullets: [
        'The rider or ustaad on your order sees your name, the delivery address and contact details for that order, and only after they accept it.',
        'Customers see the partner\'s name and verification status, not their CNIC.',
        'CNIC photos and selfies are stored privately. Only the partner and HomeCare\'s verification team can open them.',
        'Service providers that run HomeCare for us: Supabase (database, sign-in and file storage, hosted in the Asia-Pacific region), the SMS provider that sends sign-in codes, and OpenStreetMap-based map and search services.',
        'Authorities, if Pakistani law requires it.',
      ],
    },
    {
      heading: '4. Location',
      paragraphs: [
        'The customer app uses your location only when you ask it to (for example, "use my location"). The partner app shares the partner\'s location only while they are online, so nearby jobs can be offered and customers can track their order.',
      ],
    },
    {
      heading: '5. How long we keep it',
      bullets: [
        'Your account information is kept until you delete your account.',
        'When you delete your account, your profile, addresses, waitlist requests and partner documents are deleted.',
        'Finished orders are kept for accounting and disputes, but without your name, address, contact details or list.',
      ],
    },
    {
      heading: '6. Security',
      paragraphs: [
        'Connections are encrypted. Database rules make sure each person can only see their own information, and partner documents are only shared through links that expire after a few minutes.',
      ],
    },
    {
      heading: '7. Your choices',
      bullets: [
        'See and correct your profile and addresses in the app at any time.',
        'Delete your account in the app (Account → Delete account), or ask support to do it.',
        'Turn off location permission in your phone settings. Some features need it.',
      ],
    },
    {
      heading: '8. Children',
      paragraphs: ['HomeCare is for people aged 18 and over. We do not knowingly collect information from children.'],
    },
    {
      heading: '9. Changes and contact',
      paragraphs: [
        'If this policy changes in an important way, we will tell you in the app.',
        `Questions or requests: ${SUPPORT_CONTACT}.`,
      ],
    },
  ],
};

const deleteAccount: LegalDoc = {
  id: 'delete-account',
  title: 'Delete your HomeCare account',
  intro: 'You can delete your HomeCare account, and the information linked to it, at any time.',
  sections: [
    {
      heading: 'In the app',
      bullets: [
        'Open the HomeCare (or HomeCare Partner) app and sign in.',
        'Go to Account → Delete account.',
        'Confirm. Your account is deleted straight away and you are signed out.',
      ],
    },
    {
      heading: 'Without the app',
      paragraphs: [
        `Send a deletion request from your registered mobile number to ${SUPPORT_CONTACT}. We verify that the number is yours and delete the account within 7 days.`,
      ],
    },
    {
      heading: 'What is deleted',
      bullets: [
        'Your profile (name, mobile number, email, language).',
        'Your saved addresses and waitlist requests.',
        'For partners: your application, CNIC photos, selfie and payout details.',
      ],
    },
    {
      heading: 'What is kept',
      paragraphs: [
        'Finished orders are kept for accounting and to handle disputes, with your name, address, contact details and order list removed. You cannot delete your account while an order is in progress; finish or cancel it first.',
      ],
    },
  ],
};

export const LEGAL_DOCS: Record<LegalDocId, LegalDoc> = { terms, privacy, 'delete-account': deleteAccount };
