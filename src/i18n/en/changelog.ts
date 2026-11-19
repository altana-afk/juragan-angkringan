/**
 * Catatan pembaruan versi Inggris, per versi. Jumlah & urutan poin harus sama dengan
 * `src/data/changelog.ts` (dicek oleh tests/i18n.test.ts). Tambah entri di sini setiap naik versi.
 */
export const CHANGELOG_EN: Readonly<Record<string, { title: string; items: readonly string[] }>> = {
  '0.18.1': {
    title: 'New minigames for neighborhood challenges',
    items: [
      'Gang: the standoff is replaced by Rally the Neighbors. Tap the yellow hands within 10 seconds until enough people stand behind you. Watch out for red hands: gang members in disguise.',
      'Named customers who are close to you (stage 2 or higher) and sitting at the angkringan stand up for you right away.',
      'Person in crisis, gentle approach: Follow the Tune. He hums a children\'s song, and you tap along until he calms down. It still works with the sound off.',
      'Person in crisis, neighbors: Phone Chain. Call Gito, Surti, the neighborhood head, and others while they are online. The closer you are, the more often they pick up.',
      'Ratna and Officer Bram now describe their favorite order in their own words. Guess right for +2 hearts.',
    ],
  },
  '0.18.0': {
    title: "The neighborhood isn't always quiet",
    items: [
      'From day 4, three uninvited guests may show up. The more famous your angkringan, the more often they come.',
      'Stray cats like to steal 1–2 portions from the Ready to Sell board. Buy the "Keep a cat" upgrade and Belang will guard the cart for you.',
      'Sometimes a man in a mental health crisis stands near the cart until 22:00, and some customers keep away. Tap the "!!!" balloon: offer him something warm that matches his hint, or beat the kentongan drum to call the neighbors.',
      "A local gang (ormas) comes asking for protection money worth 10–15% of yesterday's sales. Pay, or face a 3-round standoff by reading the leader's body language. Lose and you pay 20%.",
      "Each minigame takes only 10–20 seconds, and the clock stops while it's open. Don't feel like playing? There's a Skip button.",
      'Two new locations: Across the Hospital and Police HQ. There you can get to know Ratna (a nurse) and Officer Bram (a police officer).',
      'Chat with them once a day until you reach 5 hearts. After that they visit at any location, and if a challenge shows up while they are eating, an ambulance or a patrol car takes care of it.',
      'Every incident is listed in the daily report, including any protection money paid. The full explanation is in Guide → Challenges.',
    ],
  },
  '0.17.0': {
    title: 'Now in English',
    items: [
      'The game is now available in English. Switch languages in Settings → Language, on the main menu or in the pause menu.',
      'Everything is translated: menus, the guide, the story of Gang Melati, menu items, upgrades, events, reports, and these release notes.',
      'In English, money and time use English formatting (Rp1,500 · Rp75K · 17:00). Your progress is not affected when you switch.',
      'New players start in the language of their browser. Existing players keep Indonesian until they change it.',
    ],
  },
  '0.16.0': {
    title: "Who's the best juragan in the neighborhood?",
    items: [
      'The main menu now has a Leaderboard. Compete with other players in 5 categories: longest run, highest revenue, biggest profit, and biggest loss in a single day, plus most cash.',
      "Yes, there's a board for the biggest loss too. If business goes badly, at least you can be the champion there.",
      'Sign in through the 👤 icon with a Google account or email, then choose a username. Your records are sent automatically whenever your progress is saved, and your rank stays visible even outside the top 50.',
      'Your progress is saved to your account as well. New phone, or playing on a laptop? Sign in with the same account and continue from your last day.',
      "If the progress in your account and on your device differ, you choose which one to use. The one you don't pick is still backed up.",
      "Don't want to sign in? That's fine. Progress is still saved on your device as usual; your records just won't appear on the leaderboard.",
      "Usernames can be changed once every 30 days and can't be the same as another player's.",
      "To keep things fair, saves changed outside the game are flagged and their records don't count on the leaderboard.",
      'Buy Ingredients has a search box. Type "tea" and find it instantly. On desktop, press / to start searching.',
    ],
  },
  '0.15.0': {
    title: 'Orders from branches & Shop filters',
    items: [
      'Online orders can be sent from a branch: choose "Send from" the main shop or a branch, or press Pick the best for the fastest source with enough stock.',
      'A branch always keeps 2 portions or 30% of each item for walk-in customers, and needs staff on duty to deliver.',
      "Sending from a branch: no commission, the buyer's delivery fee goes to your cash, and delivery costs Rp2,000 per order (Rp1,000 with a branch delivery motorbike).",
      'On desktop, the source options are shown side by side with a stock table per item.',
      'Shop has category tabs (Protein, Produce, Carbs, Seasoning, Drinks, Other) and filters for Price drop, Prep list (ingredients for the items on your Prep list), Running low, and Spoils soon. Your cart is kept when you change filters.',
    ],
  },
  '0.14.3': {
    title: 'Prep list stays put',
    items: ['Items on the Prep list no longer disappear after pressing Cook. Remove items with the × button or Clear list.'],
  },
  '0.14.2': {
    title: 'More complete day history',
    items: [
      'Day details in History now record everything in the report: best sellers, low demand, sold out, leftovers, and thrown out; customers; online orders; and the results of each branch.',
      "Each section shows a short summary in its heading, so you don't have to open them one by one.",
      'Branch details in the day history are complete: revenue, cash shortfall, operations, wages, and every product received, sold, left over, and thrown out.',
      'Fix: the Summary/History tabs on desktop are no longer see-through while scrolling.',
    ],
  },
  '0.14.1': {
    title: 'Sales history & smoother scrolling',
    items: [
      'New History tab in Stats: see sales for the last 7, 30, or 60 days with a summary, a bar chart (loss days in red), and a list per day.',
      'Tap a bar or a day row to see its details: finances, best sellers, customers, and what happened that day.',
      'On desktop, the history is shown side by side: the list of days on the left, the selected day on the right (switch days with ↑/↓).',
      'Kitchen Prep no longer jumps to the top after pressing "+ Add"; the scroll position stays on the item you tapped.',
      'Settings → Display: an "Auto-scroll" switch to jump back to the Prep list after adding an item (off by default).',
    ],
  },
  '0.14.0': {
    title: 'Angkringan Branches',
    items: [
      'Open up to 3 branches via Business → Branches.',
      "Branches sell on their own in the background during the main shop's opening hours, as long as they have an employee and food you send from the main shop.",
      'Hire employees on a daily, weekly, or monthly wage. Cheaper means a longer commitment; late wages lower performance, and after 3 late payments the employee quits.',
      "An open branch pays rent + operating costs every day. Temporarily close branches you don't use, or move them to another location.",
      'Each location can host only one open angkringan, and branches follow the daily event at their location.',
      '5 upgrades available for branches',
      'The daily report shows the results of each branch, with details of what was sold, left over, and thrown out.',
    ],
  },
  '0.13.3': {
    title: 'Online order settings',
    items: [
      'The Delivery panel shows your partner rating with stars at the top.',
      'A new switch to open or pause online orders at any time. Orders you already accepted are still delivered.',
      'Online menu prices can be set separately from in-store prices. Higher prices make online orders come in less often.',
      'Your own courier is no longer limited to 2 trips a day: Mas Joko goes back and forth all through selling hours (still up to 3 orders per trip).',
    ],
  },
  '0.13.2': {
    title: 'Motorbike deliveries',
    items: [
      'Ride-hail drivers can now be seen riding up to the street beside the cart, stopping to pick up orders, then heading off to deliver.',
      'Your own courier waits on his motorbike beside the cart, leaves to deliver, and comes back to wait after the orders are done.',
    ],
  },
  '0.13.1': {
    title: 'Kitchen menu filter & more relaxed orders',
    items: [
      "The Kitchen Prep panel has All / Food / Drinks buttons in the Menu heading, so phone players don't have to scroll far to make drinks.",
      'When an online order comes in at 2× or 3× speed, the game automatically drops back to 1× so you have time to read it.',
    ],
  },
  '0.13.0': {
    title: 'Online Orders & new buttons',
    items: [
      'Online orders! While selling, orders from outside the stall come in through the Orders button (or O). Accept or decline before time runs out.',
      'Choose a delivery method in Business → Delivery: your own courier (daily wage, delivery fees go to your cash) or a ride-hail partnership (no wage, 20% commission).',
      'Orders use the same stock as walk-in customers. If stock runs out first, the order is cancelled and your rating drops.',
      'Partner rating, buyer notes, rain that slows the courier, and 4 new upgrades: ordering system (2 tiers), courier motorbike, thermal box.',
      'Online order events such as Online Store Discount. When there are two events at once, the chip at the top shows "2 events".',
      'A tidier bottom bar: Upgrades, Promotion, Stats, and Bank are now under the Business button. You can also open the Bank by tapping your cash.',
      'Seat info moved to a small chip at the top of the screen. The old keyboard shortcuts still work.',
    ],
  },
  '0.12.1': {
    title: 'Gentler cricket sounds',
    items: [
      'Crickets now use a real recording that is softer and easier on the ears.',
      'Crickets chirp back and forth with longer pauses, and fall silent now and then.',
      'Cricket sounds only play during selling. The main menu and prep are quieter.',
    ],
  },
  '0.12.0': {
    title: "Village News & Kardi's Kitchen Book",
    items: [
      "A new story in Gang Melati: Mbah Kardi's cart, the Kitchen Book in Sri's handwriting, and Pak Hendra's shophouse plan that threatens the end of the alley.",
      'Named customers: Pak Gito, Bu Surti, Mas Bayu, and Pak Hendra. Tap the "..." bubble above them to chat. Time stops during the conversation.',
      "The Village News button in the top-right corner (or the N key): a news log, Kardi's Kitchen Book (7 chapters), your bonds with the neighbors, and the decision.",
      'Your bond grows when you serve well, stock their favorite food, and take time to chat. Closeness unlocks personal stories.',
      "Four choices at the end of the story with different endings, plus a secret menu item: Sri's Sambal Rice.",
      "Missed news isn't lost: after 5 days you hear it from the neighbors. The story never gets in the way of selling.",
      'Old saves are safe: the story starts from the day you update.',
    ],
  },
  '0.11.1': {
    title: 'Release Notes',
    items: [
      'A "What\'s new" panel appears once on the start screen after each update.',
      'Open it again any time with the 📜 icon in the top-right corner of the start screen.',
      'It contains the full history from the very first version until now.',
    ],
  },
  '0.11.0': {
    title: 'Guide & Info, menu order',
    items: [
      'A "Guide & Info" button on the main menu, the pause menu, and the H key while playing.',
      'It has 10 tabs: how to play, events, weather, locations, customers, menu, upgrades, bank & promotion, achievements, and controls.',
      "While playing, the guide highlights today's event & weather, your location, unlocked menu items, and installed upgrades.",
      'The menu list in Prep is now tidy: unlocked items on top, locked ones below, food first, then drinks.',
    ],
  },
  '0.10.0': {
    title: 'Night Market, new menu items & upgrades, web release',
    items: [
      '10 new menu items (30 in total), including fried banana, grilled corn, milk coffee, pulled milk tea, and choco-cheese grilled banana.',
      'New location, Night Market: busy late at night & on weekends, but quiet in the afternoon with expensive rent.',
      'Storage upgrades (capacity up to 4,100), extra seats (30 in total), and comfort: a fan, a rain tarp, Wi-Fi, a radio, a toilet.',
      '7 new events: a dangdut concert, fireworks, a tour bus group (bulk drink order), and more.',
      'The game can be installed to your phone/desktop home screen with the "Install game" button and played offline.',
      'Updates install automatically without interrupting a game in progress.',
    ],
  },
  '0.9.0': {
    title: 'Moving location & new maps',
    items: [
      'Move location during prep with the 📍 chip (once a day, for a moving fee, and some regulars stay behind).',
      'New maps: Market Edge (cheaper ingredients, busy afternoons) and Station Front (two busy waves, less patient customers).',
      'Fridge upgrade: drinks and chilled ingredients keep longer.',
    ],
  },
  '0.8.0': {
    title: 'Daily events, achievements & Bank',
    items: [
      'New location Near Campus, and weekdays vs weekends now feel different.',
      "Random daily events: football watch parties, a neighbor's celebration (bulk order), chili price spikes, food vloggers, payday, and more.",
      '16 achievements with cash rewards.',
      'Bank: interest-bearing term deposits and loans you can pay off in installments.',
    ],
  },
  '0.7.1': {
    title: 'Display, storage & group orders',
    items: [
      'A "Ready to Sell" board on the left of the screen; sold-out items still show as "× 0".',
      "Storage panel: see what's inside, how long it keeps, and throw out ingredients you don't use.",
      'Every member of a group orders at least one item.',
    ],
  },
  '0.7.0': {
    title: 'Fixes & optimization',
    items: [
      'Fixes: customers are no longer hidden behind benches; panels no longer open by themselves after returning to the menu.',
      'Graphics quality setting: Automatic, High, or Battery saver.',
      'Smaller update downloads.',
    ],
  },
  '0.6.0': {
    title: 'Sound, animation & tutorial',
    items: [
      'Gamelan-flavored background music, sound effects, and ambient crickets & rain.',
      'Bouncing coins, floating cash numbers, and a title card at the start of each day.',
      'A short 5-step tutorial for new players.',
    ],
  },
  '0.5.0': {
    title: 'Selling prices, upgrades & weather',
    items: [
      'Set your own selling prices: cheaper sells faster, pricier earns more per portion.',
      '17 upgrades for the cart, equipment, capacity, and surroundings, visible right on the map.',
      'Business levels unlock new menu items: nasi kucing, hot ginger drink, charcoal coffee, special grilled rice.',
      'Daily weather (sunny, cloudy, rainy, scorching) and bankruptcy rules.',
    ],
  },
  '0.4.0': {
    title: 'Daily reports & popularity',
    items: [
      'A financial report at every closing: revenue, costs, profit, best sellers, and stock thrown out.',
      'Popularity and customer loyalty.',
      '5 kinds of one-day promotion and a Stats panel.',
    ],
  },
  '0.3.0': {
    title: 'Customers arrive',
    items: [
      '7 customer types, each with their own budget, patience, and taste.',
      'Seats, queues, satisfaction, and 1×–3× time speed.',
    ],
  },
  '0.2.0': {
    title: 'Shopping & cooking',
    items: [
      'Buy ingredients at prices that change every day.',
      'The first 15 recipes, stock with expiry dates, and autosave.',
    ],
  },
  '0.1.0': {
    title: 'First version',
    items: ['A nighttime isometric angkringan, a camera you can drag & zoom, a main menu, and a HUD.'],
  },
};
