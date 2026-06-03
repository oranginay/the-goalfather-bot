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

const DATA_DIR = process.env.DATA_DIR || '.';
const GAMES_FILE = `${DATA_DIR}/games.json`;
const WM_GAMES_FILE = `${DATA_DIR}/games_wm_2026.json`;
const SENT_REMINDERS_FILE = `${DATA_DIR}/sentReminders.json`;

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

function loadJsonFile(filePath, fallback = []) {
  try {
    const rawData = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(rawData);
  } catch (error) {
    console.error(`Fehler beim Laden von ${filePath}:`, error.message);
    return fallback;
  }
}

function saveJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Fehler beim Speichern von ${filePath}:`, error.message);
  }
}

function loadGames() {
  return loadJsonFile(GAMES_FILE, []);
}

function loadWmGames() {
  return loadJsonFile(WM_GAMES_FILE, []);
}

function loadSentReminders() {
  return loadJsonFile(SENT_REMINDERS_FILE, []);
}

function saveSentReminders(reminders) {
  saveJsonFile(SENT_REMINDERS_FILE, reminders);
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

function sortGamesByDate(games) {
  return [...games].sort((a, b) => new Date(a.date) - new Date(b.date));
}

function isGermanyGame(game) {
  const text = [
    game.match,
    game.home,
    game.away,
    game.team,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return (
    text.includes('deutschland') ||
    text.includes('germany')
  );
}

function getUpcomingGames(games) {
  const now = new Date();

  return sortGamesByDate(games).filter((game) => {
    if (game.time_tbd) return true;
    return new Date(game.date) > now;
  });
}

function getAllGermanyGames() {
  const normalGames = loadGames();
  const wmGames = loadWmGames();

  return sortGamesByDate([...normalGames, ...wmGames]).filter(isGermanyGame);
}

function getUpcomingGermanyGames() {
  return getUpcomingGames(getAllGermanyGames());
}

function getReminderKey(game) {
  return `${game.match}_${game.date}_30min`;
}

function getChannelIdForGame(game) {
  if (game.team === 'women') {
    return REMINDER_CHANNEL_ID_WOMEN;
  }

  return REMINDER_CHANNEL_ID_MEN;
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
    embed.addFields({
      name: 'Anstoß',
      value: `${formatDateBerlin(game.date)}\nUhrzeit offen`,
      inline: true,
    });
  } else {
    embed.addFields({
      name: 'Anstoß',
      value: formatDateTimeBerlin(game.date),
      inline: true,
    });
  }

  if (reminder) {
    embed
      .setDescription('⏰ Dieses Deutschland-Spiel startet in 30 Minuten.')
      .setFooter({ text: 'The Goalfather Reminder' });
  } else {
    embed.setFooter({ text: 'The Goalfather' });
  }

  return embed;
}

async function checkAndSendReminders() {
  const games = getAllGermanyGames();
  const sentReminders = loadSentReminders();
  const now = new Date();

  for (const game of games) {
    if (game.time_tbd) continue;

    const channelId = getChannelIdForGame(game);

    if (!channelId) {
      console.error(`Kein Reminder-Channel gesetzt für Spiel: ${game.match}`);
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
      const channel = await client.channels.fetch(channelId);

      if (!channel) {
        console.error('Reminder-Channel nicht gefunden.');
        continue;
      }

      const embed = createGameEmbed(game, { reminder: true });

      await channel.send({
        content: '🔔 Deutschland spielt gleich!',
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
    .setName('deutschland')
    .setDescription('Zeigt das nächste Deutschland-Spiel')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('wm')
    .setDescription('Zeigt die nächsten Deutschland-Spiele der WM 2026')
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands() {
  try {
    console.log('Registriere Slash Commands...');

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    console.log('Slash Commands registriert');
  } catch (error) {
    console.error('Fehler bei Slash-Command-Registrierung:', error);
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
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'spiele') {
    const games = loadGames();
    const upcomingGames = getUpcomingGames(games).slice(0, 3);

    if (upcomingGames.length === 0) {
      await interaction.reply('Keine Spiele gefunden.');
      return;
    }

    const embeds = upcomingGames.map((game) => createGameEmbed(game));

    await interaction.reply({
      content: '**Nächste Spiele:**',
      embeds,
    });
  }

  if (interaction.commandName === 'deutschland') {
    const upcomingGermanyGames = getUpcomingGermanyGames();
    const nextGame = upcomingGermanyGames[0];

    if (!nextGame) {
      await interaction.reply('Kein kommendes Deutschland-Spiel gefunden.');
      return;
    }

    await interaction.reply({
      content: '**Nächstes Deutschland-Spiel:**',
      embeds: [createGameEmbed(nextGame)],
    });
  }

  if (interaction.commandName === 'wm') {
    const wmGames = loadWmGames();

    const upcomingGermanyWmGames = getUpcomingGames(wmGames)
      .filter(isGermanyGame)
      .slice(0, 5);

    if (upcomingGermanyWmGames.length === 0) {
      await interaction.reply('Keine kommenden Deutschland-WM-Spiele gefunden.');
      return;
    }

    const embeds = upcomingGermanyWmGames.map((game) =>
      createGameEmbed(game)
    );

    await interaction.reply({
      content: '**Nächste Deutschland-Spiele bei der WM 2026:**',
      embeds,
    });
  }
});

async function startBot() {
  await registerCommands();
  await client.login(TOKEN);
}

startBot();