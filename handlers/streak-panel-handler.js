const { EmbedBuilder, Colors, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType } = require("discord.js");
const { updateNickname } = require('../streak-handler.js');

async function buildTopStreaksEmbed(interaction, db, page = 1) {
    try {
        const settingsRes = await db.query("SELECT streakemoji FROM settings WHERE guild = $1", [interaction.guild.id]);
        const streakEmoji = settingsRes.rows[0]?.streakemoji || '🔥';

        const allUsersRes = await db.query("SELECT * FROM streaks WHERE guildid = $1 AND streakcount > 0 ORDER BY streakcount DESC;", [interaction.guild.id]);
        const allUsers = allUsersRes.rows;

        if (allUsers.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle(`✥ اعـلـى الـمصـنـفـيـن بالـسـتـريـك`)
                .setColor("Red")
                .setImage('https://i.postimg.cc/NfLYXwD5/123.jpg')
                .setDescription("لا يوجد أحد في لوحة صدارة الستريك بعد!");
            return { embeds: [embed], components: [] };
        }

        const rowsPerPage = 5;
        const totalPages = Math.ceil(allUsers.length / rowsPerPage);
        page = Math.max(1, Math.min(page, totalPages));
        const start = (page - 1) * rowsPerPage;
        const end = start + rowsPerPage;
        const pageData = allUsers.slice(start, end);

        const embed = new EmbedBuilder()
            .setTitle(`✥ اعـلـى الـمصـNـفـيـن (ستريك)`)
            .setColor("Red")
            .setImage('https://i.postimg.cc/NfLYXwD5/123.jpg')
            .setTimestamp()
            .setFooter({ text: `صفحة ${page} / ${totalPages}` });

        let descriptionText = '';

        for (let i = 0; i < pageData.length; i++) {
            const streakData = pageData[i];
            const rank = start + i + 1;

            let memberName;
            try {
                const userObj = await interaction.guild.members.fetch(streakData.userid);
                memberName = `<@${streakData.userid}>`;
            } catch (error) {
                memberName = `User Left (${streakData.userid})`;
            }

            let rankEmoji = '';
            if (rank === 1) rankEmoji = '🥇';
            else if (rank === 2) rankEmoji = '🥈';
            else if (rank === 3) rankEmoji = '🥉';
            else rankEmoji = `#${rank}`;

            descriptionText += `${rankEmoji} ${memberName}\n> **Streak**: \`${streakData.streakcount}\` ${streakEmoji}\n\n`;
        }

        embed.setDescription(descriptionText);

        let components = [];
        if (totalPages > 1) {
            const pageRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                    .setCustomId(`streak_panel_top_prev_${page}`)
                    .setLabel('◀️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 1),
                    new ButtonBuilder()
                    .setCustomId(`streak_panel_top_next_${page}`)
                    .setLabel('▶️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === totalPages)
                );
            components.push(pageRow);
        }

        return { embeds: [embed], components: components };

    } catch (err) {
        console.error("Error building top streaks embed:", err);
        return { embeds: [new EmbedBuilder().setTitle(' خطأ').setDescription('حدث خطأ أثناء جلب القائمة.').setColor(Colors.Red)], components: [] };
    }
}

async function handleStreakPanel(i, client, db) {
    let currentPage = 1;
    const selection = i.isStringSelectMenu() ? i.values[0] : i.customId;

    if (i.isButton()) {
        await i.deferUpdate();
        if (i.customId.includes('_prev_') || i.customId.includes('_next_')) {
            const pageData = i.customId.split('_');
            currentPage = parseInt(pageData[pageData.length - 1]);
            if (i.customId.includes('_prev_')) currentPage--;
            if (i.customId.includes('_next_')) currentPage++;
        }
    } else if (i.isStringSelectMenu() && i.customId === 'streak_panel_select_sep') {
        await i.deferUpdate();
    } else {
        await i.deferReply({ ephemeral: true });
    }

    const guildID = i.guild.id;
    const userID = i.user.id;
    
    const streakRes = await db.query("SELECT * FROM streaks WHERE guildid = $1 AND userid = $2", [guildID, userID]);
    let streakData = streakRes.rows[0];

    const saveStreak = async (data) => {
        await db.query(`
            INSERT INTO streaks (id, guildid, userid, streakcount, lastmessagetimestamp, hasgraceperiod, hasitemshield, nicknameactive, hasreceivedfreeshield, separator, dmnotify, higheststreak, has12hwarning) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT (id) DO UPDATE SET 
                streakcount = EXCLUDED.streakcount, 
                lastmessagetimestamp = EXCLUDED.lastmessagetimestamp, 
                hasgraceperiod = EXCLUDED.hasgraceperiod, 
                hasitemshield = EXCLUDED.hasitemshield, 
                nicknameactive = EXCLUDED.nicknameactive, 
                hasreceivedfreeshield = EXCLUDED.hasreceivedfreeshield, 
                separator = EXCLUDED.separator, 
                dmnotify = EXCLUDED.dmnotify, 
                higheststreak = EXCLUDED.higheststreak, 
                has12hwarning = EXCLUDED.has12hwarning
        `, [data.id, data.guildid, data.userid, data.streakcount, data.lastmessagetimestamp, data.hasgraceperiod, data.hasitemshield, data.nicknameactive, data.hasreceivedfreeshield, data.separator, data.dmnotify, data.higheststreak, data.has12hwarning]);
    };

    if (!streakData) {
        streakData = {
            id: `${guildID}-${userID}`,
            guildid: guildID,
            userid: userID,
            streakcount: 0,
            lastmessagetimestamp: 0,
            hasgraceperiod: 0,
            hasitemshield: 0,
            nicknameactive: 1,
            hasreceivedfreeshield: 0,
            separator: '|',
            dmnotify: 1,
            higheststreak: 0,
            has12hwarning: 0
        };
        await saveStreak(streakData);
    }

    if (selection === 'streak_panel_toggle') {
        const newState = streakData.nicknameactive === 1 ? 0 : 1;
        streakData.nicknameactive = newState;
        await saveStreak(streakData);
        await updateNickname(i.member, db);
        await i.editReply({ content: newState === 0 ? "✅ تم **إخفاء** الستريك." : "✅ تم **إظهار** الستريك.", components: [] });

    } else if (selection === 'streak_panel_change_sep') {
        const currentSep = streakData.separator || '|';

        const separatorOptions = [
            { label: '|', value: '|' },
            { label: '•', value: '•' },
            { label: '»', value: '»' },
            { label: '✦', value: '✦' },
            { label: '★', value: '★' },
            { label: '❖', value: '❖' },
            { label: '✧', value: '✧' },
            { label: '✬', value: '✬' },
            { label: '〢', value: '〢' },
            { label: '┇', value: '┇' }
        ];

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('streak_panel_select_sep')
            .setPlaceholder('اختر الفاصل الذي تفضله...')
            .addOptions(
                separatorOptions.map(opt =>
                    new StringSelectMenuOptionBuilder()
                    .setLabel(opt.label)
                    .setValue(opt.value)
                    .setDefault(opt.value === currentSep)
                )
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);
        await i.editReply({ content: 'اختر مظهر الفاصل الجديد لاسمك:', components: [row] });

    } else if (i.customId === 'streak_panel_select_sep') {
        const newSeparator = i.values[0];

        streakData.separator = newSeparator;
        await saveStreak(streakData);

        await updateNickname(i.member, db);

        await i.editReply({ content: `✅ تم تغيير فاصل الستريك الخاص بك إلى: \`${newSeparator}\``, components: [] });

    } else if (selection.startsWith('streak_panel_top')) {
        const topData = await buildTopStreaksEmbed(i, db, currentPage);
        await i.editReply(topData);

    } else if (selection === 'streak_panel_notifications') {
        const newState = streakData.dmnotify === 1 ? 0 : 1;
        streakData.dmnotify = newState;
        await saveStreak(streakData);

        const status = newState === 1 ? "مفعلة" : "معطلة";
        await i.editReply({ content: `✅ تم ضبط إشعارات الستريك الخاصة بك إلى: **${status}**.` });
    }
    return;
}

module.exports = {
    handleStreakPanel,
    buildTopStreaksEmbed
};
