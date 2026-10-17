require('dotenv').config();

const {
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
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
    ],
});

const TOKEN = 'MTU2MDkwMjU1Mzg1MDYwOTcxNg.GsOeaD.nnBryIfHMWP3D7vZyKdBmUFbj6JJ01G6x66hFE';
const CLIENT_ID = '1560902553850609716';

const tempChannels = new Set();

const commands = [
    new SlashCommandBuilder()
        .setName('teampanel')
        .setDescription('カスタムチーム作成用のパネルを表示します'),
];

const rest = new REST({ version: '10' }).setToken('MTU2MDkwMjU1Mzg1MDYwOTcxNg.GsOeaD.nnBryIfHMWP3D7vZyKdBmUFbj6JJ01G6x66hFE');

async function registerCommands() {
    try {
        console.log('スラッシュコマンドを登録中...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('スラッシュコマンドの登録が完了しました。');
    } catch (error) {
        console.error('コマンド登録エラー:', error);
    }
}

client.once('clientReady', (c) => {
    console.log(`ログインしました: ${c.user.tag}`);
    registerCommands();
});

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

            // ★追加：チーム作成後、同じチャンネルに新しい「チーム作成パネル」を自動で再送信する
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

client.on('voiceStateUpdate', async (oldState, newState) => {
    const oldChannel = oldState.channel;

    if (oldChannel && tempChannels.has(oldChannel.id)) {
        if (oldChannel.members.size === 0) {
            try {
                await oldChannel.delete();
                tempChannels.delete(oldChannel.id);
                console.log(`空になった一時VC [${oldChannel.name}] を削除しました。`);
            } catch (error) {
                console.error('VC自動削除エラー:', error);
            }
        }
    }
});

client.login('MTU2MDkwMjU1Mzg1MDYwOTcxNg.GsOeaD.nnBryIfHMWP3D7vZyKdBmUFbj6JJ01G6x66hFE');