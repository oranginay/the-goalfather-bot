const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} = require('discord.js');
const fs = require('fs');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = '1494297574977572864';
const GUILD_ID = '1368114424350642227';
const REMINDER_CHANNEL_ID = '1493672330956640477';

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

function formatGame(game) {
  if (game.time_tbd) {
    const formattedDate = new Date(game.date).toLocaleDateString('de-DE');
    return `⚽ ${game.match}\n🗓️ ${formattedDate} (Uhrzeit offen)\n🏆 ${game.competition}`;
  }

  const formattedDateTime = new Date(game.date).toLocaleString('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  return `⚽ ${game.match}\n🗓️ ${formattedDateTime}\n🏆 ${game.competition}`;
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
  const channel = await client.channels.fetch(REMINDER_CHANNEL_ID);

  if (!channel) {
    console.error('Reminder-Channel nicht gefunden.');
    return;
  }

  const now = new Date();

  for (const game of games) {
    if (game.time_tbd) continue;

    const gameDate = new Date(game.date);
  const reminderTime = new Date(gameDate.getTime() - 30 * 60 * 1000);
const reminderKey = getReminderKey(game);

if (
  now >= reminderTime &&
  now <= gameDate &&
  !sentReminders.includes(reminderKey)
)
{
      const formattedDateTime = gameDate.toLocaleString('de-DE', {
        dateStyle: 'short',
        timeStyle: 'short',
      });

      await channel.send(
        `⏰ **Reminder:** In 30 Minuten startet **${game.match}**.\n` +
        `🏆 ${game.competition}\n` +
        `🗓️ ${formattedDateTime}`
      );

      sentReminders.push(reminderKey);
      saveSentReminders(sentReminders);
    }
  }
}

const commands = [
  new SlashCommandBuilder()
    .setName('spiele')
    .setDescription('Zeigt die nächsten 3 Spiele')
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

    const text = nextThreeGames.map(formatGame).join('\n\n');

    await interaction.reply(`**Nächste Spiele:**\n\n${text}`);
  }
});

async function startBot() {
  await registerCommands();
  await client.login(TOKEN);
}

startBot();