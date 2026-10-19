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

// ==========================================
// 1. Webサーバーの設定（RenderのPing受け取り用）
// ==========================================
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    console.log('🏓 Pingを受信しました！サーバーは稼働中です。');
    res.status(200).send('I am alive!');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Web server is running on port ${PORT}`);
});

// ==========================================
// 2. トークンと環境変数の確認
// ==========================================
const TOKEN = process.env.DISCORD_TOKEN || process.env.TOKEN;

console.log("=== TOKEN デバッグ開始 ===");
console.log("中身が存在するか:", TOKEN ? `存在する（長さ: ${TOKEN.length}文字）` : "❌ 存在しない（undefined または 空）");
console.log("=== TOKEN デバッグ終了 ===");

if (!TOKEN) {
    console.error("⚠️ エラー: Discordのトークンが設定されていません。Renderの環境変数を確認してください。");
}

// ==========================================
// 3. Discord Botの初期化とコマンド登録関数
// ==========================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
    ]
});

const tempChannels = new Set();

// 登録するスラッシュコマンド一覧
const commands = [
    new SlashCommandBuilder()
        .setName('teampanel')
        .setDescription('カスタムチーム作成用のパネルを表示します'),
];

// スラッシュコマンドをDiscordに登録する関数
async function registerCommands() {
    try {
        const rest = new REST({ version: '10' }).setToken(TOKEN);
        console.log('スラッシュコマンドの登録を開始します...');

        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );

        console.log('スラッシュコマンドの登録が完了しました！');
    } catch (error) {
        console.error('コマンド登録エラー:', error);
    }
}

// ログイン時の処理（v15推奨の clientReady に変更済み）
client.once('clientReady', async (c) => {
    console.log(`✅ ログインしました: ${c.user.tag}`);
    await registerCommands();
});

// ==========================================
// 4. ボタン・モーダル・コマンドのインタラクション処理
// ==========================================
client.on('interactionCreate', async (interaction) => {
    // --- A. スラッシュコマンド /teampanel ---
    if (interaction.isChatInputCommand() && interaction.commandName === 'teampanel') {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('open_team_modal')
                .setLabel('➕ チームを作成する')
                .setStyle(ButtonStyle.Primary)
        );

        await interaction.reply({
            content: '下のボタンを押して、好きなチーム名を入力してください！',
            components: [row],
        });
        return;
    }

    // --- B. 「チームを作成する」ボタンが押されたとき ---
    if (interaction.isButton() && interaction.customId === 'open_team_modal') {
        const modal = new ModalBuilder()
            .setCustomId('team_name_modal')
            .setTitle('チームの作成');

        const teamNameInput = new TextInputBuilder()
            .setCustomId('team_name_input')
            .setLabel('作成したいチーム名を入力してください')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('例: Aチーム / チーム赤 / 雑談部屋')
            .setMaxLength(30)
            .setRequired(true);

        const actionRow = new ActionRowBuilder().addComponents(teamNameInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
        return;
    }

    // --- C. モーダルで送信ボタンが押されたとき ---
    if (interaction.isModalSubmit() && interaction.customId === 'team_name_modal') {
        const member = interaction.member;

        if (!member.voice.channel) {
            return interaction.reply({
                content: '⚠️ 先にいずれかのボイスチャンネルに参加してから実行してください！',
                flags: 64,
            });
        }

        const teamName = interaction.fields.getTextInputValue('team_name_input');

        await interaction.deferReply({ flags: 64 });

        try {
            // VCの作成
            const newChannel = await interaction.guild.channels.create({
                name: teamName,
                type: ChannelType.GuildVoice,
                parent: member.voice.channel.parentId,
            });

            tempChannels.add(newChannel.id);
            await member.voice.setChannel(newChannel);

            // 本人に完了通知
            await interaction.editReply({
                content: `✅ チーム「**${teamName}**」を作成し、移動しました！`,
            });

            // 作成されたVCのチャットに案内送信
            await newChannel.send(`🎉 **${member.displayName}** さんがチーム「**${teamName}**」を作成しました！`);

            // チーム作成後、同じチャンネルに新しい「チーム作成パネル」を自動で再送信する
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('open_team_modal')
                    .setLabel('➕ さらにチームを作成する')
                    .setStyle(ButtonStyle.Primary)
            );

            await interaction.channel.send({
                content: '続けてチームを作成したい場合は、下のボタンを押してください👇',
                components: [row],
            });

        } catch (error) {
            console.error('VC作成エラー:', error);
            await interaction.editReply({
                content: 'チームVCの作成または移動に失敗しました。Botの権限を確認してください。',
            });
        }
    }
});

// ==========================================
// 5. ボイスチャンネル自動削除（誰もいなくなったら削除）
// ==========================================
client.on('voiceStateUpdate', async (oldState, newState) => {
    const oldChannel = oldState.channel;

    if (oldChannel && tempChannels.has(oldChannel.id)) {
        if (oldChannel.members.size === 0) {
            try {
                await oldChannel.delete();
                tempChannels.delete(oldChannel.id);
                console.log(`🗑️ 空になった一時VC [${oldChannel.name}] を削除しました。`);
            } catch (error) {
                console.error('VC自動削除エラー:', error);
            }
        }
    }
});

// ==========================================
// 6. Botのログイン
// ==========================================
client.login(TOKEN);