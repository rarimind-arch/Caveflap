// Legal text templates + support/version constants.
// Extracted verbatim from the original single-file game; filled in for real
// in src/game/legal.js by the store-listing pass (see docs/BUILD_INSTRUCTIONS.md).

  // ---------- legal texts (templates: fill in the [brackets] and have a lawyer review) ----------
  const COMPANY = '[Your company name]', SUPPORT_EMAIL = 'support@example.com', APP_VERSION = '1.0.0';
  const LEGAL = {
    privacy:{ title:'Privacy policy', body:[
      ['Template', 'Replace every part in [brackets] and have this checked by a lawyer before you publish.'],
      ['Who we are', `Cave Flap is made by ${COMPANY}, [address, country]. Contact: ${SUPPORT_EMAIL}.`],
      ['What we collect', 'Your account ID and display name from the sign-in you use. Your game progress: levels, crystals, medallions, items, stats and settings. The player name and scores you show on leaderboards and in online battles, which other players can see. Purchase records from the app store (we never receive your card details). An advertising ID, only if you allow personalized ads. Crash reports and anonymous usage data to fix bugs and improve the game.'],
      ['Why we use it', 'To run the game and save your progress, to run leaderboards and online battles, to process purchases, to show ads, and to find and fix problems.'],
      ['Legal basis (EU)', 'Running the game you asked for (contract). Your consent for personalized ads, which you can withdraw in Settings. Our legitimate interest in keeping the game secure and working.'],
      ['Who we share it with', 'App stores for purchases, our ad partner [e.g. Google AdMob] for ads, and our analytics and crash-report provider [e.g. Firebase]. We never sell your personal data.'],
      ['How long we keep it', 'As long as your account exists. Ask us to delete it at any time and we will do so within 30 days.'],
      ['Your rights', `You can ask for a copy of your data, correct it, delete it, or object to how we use it: email ${SUPPORT_EMAIL}. You can also complain to your data protection authority (in Lithuania, the State Data Protection Inspectorate).`],
      ['Children', 'Cave Flap is not meant for children under 13 (16 where EU law requires).'],
      ['Changes', 'If this policy changes, we will show the new version in the game. Last updated: [date].'],
    ] },
    terms:{ title:'Terms of use', body:[
      ['Template', 'Replace every part in [brackets] and have this checked by a lawyer before you publish.'],
      ['Agreement', `By playing Cave Flap you agree to these terms. The game is provided by ${COMPANY}.`],
      ['Your account', 'Keep your sign-in secure. You are responsible for what happens on your account. Pick a player name that is not offensive or pretending to be someone else.'],
      ['Virtual items', 'Crystals, medallions, bats and other items are a license to use them inside the game. They have no real-world money value, cannot be sold or exchanged for money, and are not refundable except where the law requires.'],
      ['Purchases', 'Purchases are handled by Apple or Google under their terms. Refund requests go through the store you bought from.'],
      ['Fair play', 'No cheating, hacking, bots, exploiting bugs or harassing other players. We may reset progress or close accounts that break these rules.'],
      ['Ads', 'The game shows ads. Rewarded ads are optional. Remove Ads turns off pop-up and banner ads.'],
      ['Changes and availability', 'We may update, change or stop features, including the in-game economy. We do our best to keep the game running but cannot promise it is always available.'],
      ['Liability', 'The game is provided as is. As far as the law allows, we are not liable for indirect losses.'],
      ['Law', 'These terms are governed by the laws of [Lithuania]. Contact: ' + SUPPORT_EMAIL + '.'],
    ] },
  };


export { APP_VERSION, COMPANY, LEGAL, SUPPORT_EMAIL };
