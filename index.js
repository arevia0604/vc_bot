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
    console.log('🏓 VC追加Bot: Pingを受信しました！');
    res.status(200).send('VC Bot is alive!');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Web server is running on port ${PORT}`);
});

// ==========================================
// 2. トークンと環境変数の確認
// ==========================================
const TOKEN = process.env.DISCORD_TOKEN || process.env.TOKEN;

if (!TOKEN) {
    console.error("⚠️ エラー: Discordのトークンが設定されていません。");
}

// ==========================================
// 3. 一時VC管理用ストレージ
// ==========================================
const tempChannels = new Set();

// ==========================================
// 4. Discord Botの初期化とコマンド登録
// ==========================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
    ]
});

// スラッシュコマンドの定義
const commands = [
    new SlashCommandBuilder()
        .setName('teampanel')
        .setDescription('チーム作成VCおよびヘルプを管理します')
        // /teampanel help
        .addSubcommand(sub =>
            sub.setName('help')
                .setDescription('VC追加Botの使い方を表示します')
        )
        // /teampanel panel
        .addSubcommand(sub =>
            sub.setName('panel')
                .setDescription('ボタンを押してチームを作成できるパネルを表示します')
        )
        // /teampanel create <team_name>
        .addSubcommand(sub =>
            sub.setName('create')
                .setDescription('コマンドから直接新しいチーム（VC）を作成します')
                .addStringOption(opt =>
                    opt.setName('team_name')
                        .setDescription('作成したいチーム名')
                        .setRequired(true)
                )
        )
        // /teampanel rename <new_name> （★新機能：チーム名変更）
        .addSubcommand(sub =>
            sub.setName('rename')
                .setDescription('現在参加しているチームVCの名前を変更します')
                .addStringOption(opt =>
                    opt.setName('new_name')
                        .setDescription('変更後の新しいチーム名')
                        .setRequired(true)
                )
        ),
];

async function registerCommands() {
    try {
        const rest = new REST({ version: '10' }).setToken(TOKEN);
        console.log('VC追加Bot: スラッシュコマンドを登録中...');

        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands.map(c => c.toJSON()) },
        );

        console.log('VC追加Bot: スラッシュコマンドの登録完了！');
    } catch (error) {
        console.error('コマンド登録エラー:', error);
    }
}

client.once('clientReady', async (c) => {
    console.log(`✅ VC追加Bot ログイン成功: ${c.user.tag}`);
    await registerCommands();
});

// ==========================================
// 5. ヘルプ内容を表示する関数
// ==========================================
function getHelpContent() {
    return `🔊 **チーム作成VC追加Bot 使い方ガイド** 🔊

サーバーでもDMでも（VCを作成するサーバー内でお使いください）、以下のコマンドやボタンが使えます！

• **\`/teampanel help\`**
  ➡️ この使い方ガイドを表示します。
• **\`/teampanel panel\`**
  ➡️ ボタンを押してポップアップ（モーダル）からチーム名を入力・作成できるパネルを送信します。
• **\`/teampanel create [チーム名]\`**
  ➡️ コマンドから直接テキストでチームVCを作成し、自動でそのチャンネルに移動します。
• **\`/teampanel rename [新しいチーム名]\`**
  ➡️ **【新機能】** 現在自分が参加している一時VCの名前を変更します！`;
}

// ==========================================
// 6. チームVC作成の共通処理
// ==========================================
async function createTeamVoiceChannel(interaction, teamName) {
    const member = interaction.member;

    if (!member || !member.voice.channel) {
        return interaction.reply({
            content: '⚠️ 先にいずれかのボイスチャンネルに参加してから実行してください！',
            ephemeral: true,
        });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
        const newChannel = await interaction.guild.channels.create({
            name: teamName,
            type: ChannelType.GuildVoice,
            parent: member.voice.channel.parentId,
        });

        tempChannels.add(newChannel.id);
        await member.voice.setChannel(newChannel);

        await interaction.editReply({
            content: `✅ チーム「**${teamName}**」を作成し、移動しました！`,
        });

        await newChannel.send(`🎉 **${member.displayName}** さんがチーム「**${teamName}**」を作成しました！`);

    } catch (error) {
        console.error('VC作成エラー:', error);
        await interaction.editReply({
            content: 'チームVCの作成または移動に失敗しました。Botの権限を確認してください。',
        });
    }
}

// ==========================================
// 7. インタラクション処理
// ==========================================
client.on('interactionCreate', async (interaction) => {

    // --- A. スラッシュコマンドの処理 ---
    if (interaction.isChatInputCommand() && interaction.commandName === 'teampanel') {
        const sub = interaction.options.getSubcommand();

        if (sub === 'help') {
            await interaction.reply({ content: getHelpContent(), ephemeral: true });
            return;
        }

        if (sub === 'panel') {
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

        if (sub === 'create') {
            const teamName = interaction.options.getString('team_name');
            await createTeamVoiceChannel(interaction, teamName);
            return;
        }

        // ★新機能：チーム名変更コマンドの処理
        if (sub === 'rename') {
            const member = interaction.member;
            const newName = interaction.options.getString('new_name');

            if (!member || !member.voice.channel) {
                return interaction.reply({
                    content: '⚠️ 名前の変更を行いたいボイスチャンネルに参加した状態で実行してください！',
                    ephemeral: true,
                });
            }

            const currentChannel = member.voice.channel;

            // 当該チャンネルがこのBotで管理している一時VCかどうかチェック
            if (!tempChannels.has(currentChannel.id)) {
                return interaction.reply({
                    content: '⚠️ このボイスチャンネルはこのBotで作成された一時VCではないため、名前を変更できません。',
                    ephemeral: true,
                });
            }

            try {
                const oldName = currentChannel.name;
                await currentChannel.setName(newName);

                await interaction.reply({
                    content: `✨ チームVCの名前を「**${oldName}**」から「**${newName}**」に変更しました！`,
                    ephemeral: true,
                });
            } catch (error) {
                console.error('VC名前変更エラー:', error);
                await interaction.reply({
                    content: '⚠️ チャンネル名の変更に失敗しました。Botにチャンネル管理権限があるか確認してください。',
                    ephemeral: true,
                });
            }
            return;
        }
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

    // --- C. モーダル送信時の処理 ---
    if (interaction.isModalSubmit() && interaction.customId === 'team_name_modal') {
        const teamName = interaction.fields.getTextInputValue('team_name_input');
        await createTeamVoiceChannel(interaction, teamName);
        return;
    }
});

// ==========================================
// 8. ボイスチャンネル自動削除（誰もいなくなったら削除）
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
// 9. Botのログイン
// ==========================================
client.login(TOKEN);