import 'dotenv/config';
import express from 'express';
import {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    REST,
    Routes,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelType,
} from 'discord.js';

const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.status(200).send('VC Bot is alive!'));
app.listen(PORT, '0.0.0.0');

const TOKEN = process.env.DISCORD_TOKEN || process.env.TOKEN;
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates]
});
const tempChannels = new Set();

const commands = [
    new SlashCommandBuilder()
        .setName('teampanel')
        .setDescription('チーム作成パネルおよびヘルプを管理します')
        .addSubcommand(sub => sub.setName('help').setDescription('VC追加Botの使い方を表示します'))
        .addSubcommand(sub => sub.setName('panel').setDescription('チーム作成用パネルを表示します'))
];

async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands.map(c => c.toJSON()) });
}

client.once('clientReady', async (c) => {
    console.log(`✅ VC追加Bot ログイン: ${c.user.tag}`);
    await registerCommands();
});

function getHelpContent() {
    return `🔊 **チーム作成VC追加Botの使い方** 🔊
• \`/teampanel help\`: この使い方を表示
• \`/teampanel panel\`: チーム作成用のボタンパネルを表示します`;
}

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'teampanel') return;
    const sub = interaction.options.getSubcommand();

    if (sub === 'help') {
        await interaction.reply({ content: getHelpContent(), ephemeral: true });
    } else if (sub === 'panel') {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('open_team_modal').setLabel('➕ チームを作成する').setStyle(ButtonStyle.Primary)
        );
        await interaction.reply({ content: '下のボタンを押して、好きなチーム名を入力してください！', components: [row] });
    }
});

// ボタン・モーダル・VC自動削除の処理は前回のコードをそのまま維持できます

client.login(TOKEN);