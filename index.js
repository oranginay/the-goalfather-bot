const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
} = require('discord.js');
const fs = require('fs');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const REMINDER_CHANNEL_ID_MEN = process.env.REMINDER_CHANNEL_ID_MEN;
const REMINDER_CHANNEL_ID_WOMEN = process.env.REMINDER_CHANNEL_ID_WOMEN;
const WORLD_CUP_2026_LEAGUE_ID = '4429';
const SPORTSDB_API_KEY = process.env.SPORTSDB_API_KEY || '3';
const DATA_DIR = process.env.DATA_DIR || '.';
const WM_GAMES_FILE = `${DATA_DIR}/games_wm_2026.json`;
const WM_PREDICTIONS_FILE = `${DATA_DIR}/predictions_wm_2026.json`;

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

function loadGames() {
  try {
    const rawData = fs.readFileSync('./games.json', 'utf8');
    return JSON.parse(rawData);
  } catch (error) {
    console.error('Fehler beim Laden von games.json:', error);
    return [];
  }
}

function loadSentReminders() {
  try {
    const rawData = fs.readFileSync('./sentReminders.json', 'utf8');
    return JSON.parse(rawData);
  } catch (error) {
    console.error('Fehler beim Laden von sentReminders.json:', error);
    return [];
  }
}

function saveSentReminders(reminders) {
  try {
    fs.writeFileSync('./sentReminders.json', JSON.stringify(reminders, null, 2));
  } catch (error) {
    console.error('Fehler beim Speichern von sentReminders.json:', error);
  }
}

function formatDateTimeBerlin(dateString) {
  return new Date(dateString).toLocaleString('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Berlin',
  });
}

function formatDateBerlin(dateString) {
  return new Date(dateString).toLocaleDateString('de-DE', {
    timeZone: 'Europe/Berlin',
  });
}

function createGameEmbed(game, options = {}) {
  const { reminder = false } = options;

  const embed = new EmbedBuilder()
    .setTitle(game.match)
    .setColor(reminder ? 0xeab308 : 0x2563eb)
    .addFields({
      name: 'Wettbewerb',
      value: game.competition || 'Unbekannt',
      inline: true,
    })
    .setTimestamp();

  if (game.time_tbd) {
    const formattedDate = formatDateBerlin(game.date);
    embed.addFields({
      name: 'Anstoß',
      value: `${formattedDate}\nUhrzeit offen`,
      inline: true,
    });
  } else {
    const formattedDateTime = formatDateTimeBerlin(game.date);
    embed.addFields({
      name: 'Anstoß',
      value: formattedDateTime,
      inline: true,
    });
  }

  if (reminder) {
    embed
      .setDescription('⏰ Dieses Spiel startet in 30 Minuten.')
      .setFooter({ text: 'The Goalfather Reminder' });
  } else {
    embed.setFooter({ text: 'The Goalfather' });
  }

  return embed;
}

function sortGamesByDate(games) {
  return [...games].sort((a, b) => new Date(a.date) - new Date(b.date));
}

function getUpcomingGames(games) {
  const now = new Date();

  return sortGamesByDate(games).filter((game) => {
    if (game.time_tbd) return true;
    return new Date(game.date) > now;
  });
}

function getReminderKey(game) {
  return `${game.match}_${game.date}_30min`;
}

async function checkAndSendReminders() {
  const games = loadGames();
  const sentReminders = loadSentReminders();
  const now = new Date();

  for (const game of games) {
    if (game.time_tbd) continue;

    const channelId =
      game.team === 'women'
        ? REMINDER_CHANNEL_ID_WOMEN
        : REMINDER_CHANNEL_ID_MEN;

    if (!channelId) {
      console.error(`Kein Reminder-Channel gesetzt für Team: ${game.team}`);
      continue;
    }

    const channel = await client.channels.fetch(channelId);

    if (!channel) {
      console.error('Reminder-Channel nicht gefunden.');
      continue;
    }

    const gameDate = new Date(game.date);
    const reminderTime = new Date(gameDate.getTime() - 30 * 60 * 1000);
    const reminderKey = getReminderKey(game);

    if (
      now >= reminderTime &&
      now <= gameDate &&
      !sentReminders.includes(reminderKey)
    ) {
      const embed = createGameEmbed(game, { reminder: true });

      await channel.send({
        content: '🔔 Spiel-Erinnerung',
        embeds: [embed],
      });

      sentReminders.push(reminderKey);
      saveSentReminders(sentReminders);

      console.log(`Reminder gesendet für: ${game.match}`);
    }
  }
}

const commands = [
  new SlashCommandBuilder()
    .setName('spiele')
    .setDescription('Zeigt die nächsten 3 Spiele')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('updatewm')
    .setDescription('Aktualisiert die WM-2026-Spiele von TheSportsDB')
    .toJSON(),

    new SlashCommandBuilder()
  .setName('spielewm')
  .setDescription('Zeigt die nächsten 5 WM-Spiele')
  .toJSON(),

  new SlashCommandBuilder()
  .setName('tippwm')
  .setDescription('Gib deinen Tipp für ein WM-Spiel ab')
  .addStringOption(option =>
 option.setName('spielid')
 .setDescription('WM-Spiel auswählen')
 .setRequired(true)
 .setAutocomplete(true))
  .addIntegerOption(option =>
    option.setName('heim')
      .setDescription('Tore Heimteam')
      .setRequired(true))
  .addIntegerOption(option =>
    option.setName('gast')
      .setDescription('Tore Auswärtsteam')
      .setRequired(true))
  .toJSON(),

  new SlashCommandBuilder()
  .setName('leaderboardwm')
  .setDescription('Top 10 der WM')
  .toJSON(),

new SlashCommandBuilder()
  .setName('rankwm')
  .setDescription('Dein WM-Rang')
  .toJSON(),

  new SlashCommandBuilder()
  .setName('meinetippswm')
  .setDescription('Zeigt deine abgegebenen WM-Tipps')
  .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands() {
  try {
    console.log('Registriere Slash Command...');

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    console.log('Slash Command registriert');
  } catch (error) {
    console.error('Fehler bei Slash-Command-Registrierung:', error);
  }
}
function saveWmGames(games) {
  try {
    fs.writeFileSync(WM_GAMES_FILE, JSON.stringify(games, null, 2));
  } catch (error) {
    console.error('Fehler beim Speichern von WM_GAMES_FILE:', error);
  }
}
function loadWmGames() {
  try {
    const rawData = fs.readFileSync(WM_GAMES_FILE, 'utf8');
    return JSON.parse(rawData);
  } catch (error) {
    console.error('Fehler beim Laden von WM_GAMES_FILE:', error);
    return [];
  }
}

function mapSportsDbEventToWmGame(event, oldGame = null) {
  return {
    id: `wm2026_${event.idEvent}`,
    sportsDbId: event.idEvent,
   date: event.strTimestamp || `${event.dateEvent}T${event.strTime || '00:00:00'}`,
    match: event.strEvent,
    home: event.strHomeTeam,
    away: event.strAwayTeam,
    competition: 'WM 2026',
    source: 'TheSportsDB',
    result:
      event.intHomeScore !== null && event.intAwayScore !== null
        ? {
            home: Number(event.intHomeScore),
            away: Number(event.intAwayScore),
          }
        : null,
     status: event.strStatus || null,
  evaluated: oldGame?.evaluated || false  
  };
}

async function updateWmGamesFromSportsDb() {
  const oldGames = loadWmGames();

  const url = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_API_KEY}/eventsseason.php?id=${WORLD_CUP_2026_LEAGUE_ID}&s=2026`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`TheSportsDB Fehler: ${response.status}`);
  }

  const data = await response.json();

  if (!data.events) {
    console.log('Keine WM-Spiele von TheSportsDB gefunden.');
    return [];
  }

  const wmGames = data.events.map(event => {
    const oldGame = oldGames.find(g => g.sportsDbId === event.idEvent);
    return mapSportsDbEventToWmGame(event, oldGame);
  });

  saveWmGames(wmGames);
  evaluatePredictions();

  return wmGames;
}

function loadWmPredictions() {
  try {
    const rawData = fs.readFileSync(WM_PREDICTIONS_FILE, 'utf8');
    return JSON.parse(rawData);
  } catch (error) {
    console.error('Fehler beim Laden von WM_PREDICTIONS_FILE:', error);
    return [];
  }
}

function saveWmPredictions(predictions) {
  try {
    fs.writeFileSync(
      WM_PREDICTIONS_FILE,
      JSON.stringify(predictions, null, 2)
    );
  } catch (error) {
    console.error('Fehler beim Speichern von WM_PREDICTIONS_FILE:', error);
  }
}

function calculatePoints(prediction, result) {
  if (prediction.home === result.home && prediction.away === result.away) {
    return 3;
  }

  const predDiff = prediction.home - prediction.away;
  const resDiff = result.home - result.away;

  if (predDiff === resDiff) {
    return 2;
  }

  if (
    (predDiff > 0 && resDiff > 0) ||
    (predDiff < 0 && resDiff < 0) ||
    (predDiff === 0 && resDiff === 0)
  ) {
    return 1;
  }

  return 0;
}

function buildWmRanking() {
  const games = loadWmGames();
  const predictions = loadWmPredictions();

  const scores = {};

  for (const game of games) {
    if (!game.result) continue;

    const gamePredictions = predictions.filter(
      p => p.gameId === game.id
    );

    for (const pred of gamePredictions) {
      const points = typeof pred.points === 'number'
  ? pred.points
  : calculatePoints(pred, game.result);

      if (!scores[pred.userId]) {
        scores[pred.userId] = 0;
      }

      scores[pred.userId] += points;
    }
  }

  return Object.entries(scores)
    .map(([userId, points]) => ({ userId, points }))
    .sort((a, b) => b.points - a.points);
}

function evaluatePredictions() {
  const games = loadWmGames();
  const predictions = loadWmPredictions();

  let changed = false;

  for (const pred of predictions) {
    const game = games.find(g => g.id === pred.gameId);
    if (!game || !game.result) continue;

    const points = calculatePoints(pred, game.result);

    if (pred.points !== points) {
      pred.points = points;
      pred.evaluatedAt = new Date().toISOString();
      changed = true;
    }
  }

  if (changed) {
    saveWmPredictions(predictions);
  }
}

client.once('clientReady', async () => {
  console.log('The Goalfather ist online 👑');

  await checkAndSendReminders();

  setInterval(async () => {
    try {
      await checkAndSendReminders();
    } catch (error) {
      console.error('Fehler bei Reminder-Prüfung:', error);
    }
  }, 60 * 1000);

  setInterval(async () => {
    try {
      const wmGames = await updateWmGamesFromSportsDb();
      console.log(`WM-Spiele automatisch aktualisiert: ${wmGames.length}`);
    } catch (error) {
      console.error('Fehler bei automatischem WM-Update:', error);
    }
  }, 15 * 60 * 1000);
});

client.on('interactionCreate', async (interaction) => {
 if (interaction.isAutocomplete()) {
  if (interaction.commandName !== 'tippwm') return;

  const focusedValue = interaction.options.getFocused().toLowerCase();
  const games = loadWmGames();

  const choices = games
   .filter(game => new Date(game.date) > new Date())
   .filter(game => {
    const label = `${game.match} ${formatDateTimeBerlin(game.date)}`.toLowerCase();
    return label.includes(focusedValue);
   })
   .sort((a, b) => new Date(a.date) - new Date(b.date))
   .slice(0, 25)
   .map(game => ({
    name: `${formatDateTimeBerlin(game.date)} | ${game.match}`,
    value: game.id,
   }));

  await interaction.respond(choices);
  return;
 }

 if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'spiele') {
    const games = loadGames();
    const upcomingGames = getUpcomingGames(games);
    const nextThreeGames = upcomingGames.slice(0, 3);

    if (nextThreeGames.length === 0) {
      await interaction.reply('Keine Spiele gefunden.');
      return;
    }

    const embeds = nextThreeGames.map((game) => createGameEmbed(game));

    await interaction.reply({
      content: '**Nächste Spiele:**',
      embeds,
    });
  }
    if (interaction.commandName === 'updatewm') {
    await interaction.deferReply();

    try {
      const wmGames = await updateWmGamesFromSportsDb();

      await interaction.editReply(
        `WM-Spiele aktualisiert. Gespeicherte Spiele: ${wmGames.length}`
      );
    } catch (error) {
      console.error('Fehler bei /updatewm:', error);

      await interaction.editReply(
        'Fehler beim Laden der WM-Spiele.'
      );
    }
  }
 if (interaction.commandName === 'spielewm') {
  const games = loadWmGames();

  const upcomingGames = games
    .filter(g => new Date(g.date) > new Date())
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 5);

  if (upcomingGames.length === 0) {
    await interaction.reply('Keine WM-Spiele gefunden.');
    return;
  }

  const embeds = upcomingGames.map((game) => {
    const embed = createGameEmbed({
      match: game.match,
      date: game.date,
      competition: game.competition
    });

    embed.addFields({
      name: 'Spiel-ID',
      value: game.id,
      inline: false
    });

    return embed;
  });

  await interaction.reply({
    content: '**Nächste WM-Spiele:**',
    embeds,
  });
}
if (interaction.commandName === 'tippwm') {
  await interaction.deferReply({ ephemeral: true });

  try {
    const gameId = interaction.options.getString('spielid');
    const home = interaction.options.getInteger('heim');
    const away = interaction.options.getInteger('gast');
    const userId = interaction.user.id;

    const games = loadWmGames();
    const predictions = loadWmPredictions();

    const game = games.find(g => g.id === gameId);

    if (!game) {
      await interaction.editReply('Spiel nicht gefunden.');
      return;
    }

    if (new Date(game.date) <= new Date()) {
      await interaction.editReply('Tippabgabe ist geschlossen.');
      return;
    }

    const existing = predictions.find(
      p => p.userId === userId && p.gameId === gameId
    );

    if (existing) {
      existing.home = home;
      existing.away = away;
    } else {
      predictions.push({
        userId,
        gameId,
        home,
        away
      });
    }

    saveWmPredictions(predictions);

    await interaction.editReply(
      `Tipp gespeichert: ${game.match} → ${home}:${away}`
    );
  } catch (error) {
    console.error('Fehler bei /tippwm:', error);
    await interaction.editReply('Fehler beim Speichern des Tipps.');
  }
}
if (interaction.commandName === 'leaderboardwm') {
  const ranking = buildWmRanking().slice(0, 10);

  if (ranking.length === 0) {
    await interaction.reply('Noch keine Punkte vorhanden.');
    return;
  }

  let text = '🏆 **WM Leaderboard (Top 10)**\n\n';

  ranking.forEach((entry, index) => {
    text += `${index + 1}. <@${entry.userId}> – ${entry.points} Punkte\n`;
  });

  await interaction.reply(text);
}

if (interaction.commandName === 'rankwm') {
  const ranking = buildWmRanking();
  const userId = interaction.user.id;

  const index = ranking.findIndex(r => r.userId === userId);

  if (index === -1) {
    await interaction.reply('Du hast noch keine Punkte.');
    return;
  }

  const entry = ranking[index];

  await interaction.reply(
    `📊 Dein Rang:\n\nPlatz ${index + 1} mit ${entry.points} Punkten`
  );
}
if (interaction.commandName === 'meinetippswm') {
  await interaction.deferReply({ ephemeral: true });

  try {
    const userId = interaction.user.id;
    const games = loadWmGames();
    const predictions = loadWmPredictions();

    const userPredictions = predictions.filter(p => p.userId === userId);

    if (userPredictions.length === 0) {
      await interaction.editReply('Du hast noch keine WM-Tipps abgegeben.');
      return;
    }

    const lines = userPredictions.map(prediction => {
      const game = games.find(g => g.id === prediction.gameId);
      const matchName = game ? game.match : prediction.gameId;
      const date = game ? formatDateTimeBerlin(game.date) : 'Datum unbekannt';

      return `**${matchName}**\n${date}\nDein Tipp: ${prediction.home}:${prediction.away}`;
    });

    await interaction.editReply(
      `📋 **Deine WM-Tipps**\n\n${lines.join('\n\n')}`
    );
  } catch (error) {
    console.error('Fehler bei /meinetippswm:', error);
    await interaction.editReply('Fehler beim Laden deiner WM-Tipps.');
  }
}

});

async function startBot() {
  await registerCommands();
  await client.login(TOKEN);
}

startBot();