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
    fs.writeFileSync('./games_wm_2026.json', JSON.stringify(games, null, 2));
  } catch (error) {
    console.error('Fehler beim Speichern von games_wm_2026.json:', error);
  }
}

function loadWmGames() {
  try {
    const rawData = fs.readFileSync('./games_wm_2026.json', 'utf8');
    return JSON.parse(rawData);
  } catch (error) {
    console.error('Fehler beim Laden von games_wm_2026.json:', error);
    return [];
  }
}

function mapSportsDbEventToWmGame(event) {
  return {
    id: `wm2026_${event.idEvent}`,
    sportsDbId: event.idEvent,
    date: `${event.dateEvent}T${event.strTime || '00:00:00'}Z`,
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
  };
}

async function updateWmGamesFromSportsDb() {
  const url = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_API_KEY}/eventsnextleague.php?id=${WORLD_CUP_2026_LEAGUE_ID}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`TheSportsDB Fehler: ${response.status}`);
  }

  const data = await response.json();

  if (!data.events) {
    console.log('Keine WM-Spiele von TheSportsDB gefunden.');
    return [];
  }
  if (interaction.commandName === 'updatewm') {
  await interaction.deferReply(); // 🔥 GANZ WICHTIG

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

  const wmGames = data.events.map(mapSportsDbEventToWmGame);

  saveWmGames(wmGames);

  return wmGames;
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
});

client.on('interactionCreate', async (interaction) => {
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
});

async function startBot() {
  await registerCommands();
  await client.login(TOKEN);
}

startBot();