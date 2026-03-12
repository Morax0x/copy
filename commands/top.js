const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const path = require('path');

const { generateTopImage } = require('../generators/top-image-generator.js');
const weaponsConfig = require('../json/weapons-config.json');
const { OWNER_ID } = require('../handlers/dungeon/constants.js'); 

const PROFILE_BASE_HP = 100;
const PROFILE_HP_PER_LEVEL = 4;
const ROWS_PER_PAGE = 10; 

function getWeekStartDateString() {
    const now = new Date(); const diff = now.getUTCDate() - (now.getUTCDay() + 2) % 7;
    const friday = new Date(now.setUTCDate(diff)); friday.setUTCHours(0, 0, 0, 0); return friday.toISOString().split('T')[0];
}
function getTodayDateString() { return new Date().toISOString().split('T')[0]; }
function getMonthStartDateString() {
    const now = new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().split('T')[0];
}

async function fetchLeaderboardData(client, sql, guild, type, page, targetUserId = null) {
    let allUsers = [];
    
    try {
        if (type === 'level') {
            const res = await sql.query(`SELECT * FROM levels WHERE "guild" = $1 AND "user" != $2 ORDER BY "totalXP" DESC`, [guild.id, OWNER_ID]);
            allUsers = res.rows;
        } else if (type === 'rep') {
            const res = await sql.query(`SELECT "userID" as "user", CAST("rep_points" AS INTEGER) as rp FROM user_reputation WHERE "guildID" = $1 AND "userID" != $2 AND CAST("rep_points" AS INTEGER) > 0 ORDER BY rp DESC`, [guild.id, OWNER_ID]);
            allUsers = res.rows;
        } else if (type === 'weekly_xp') {
            const weekStart = getWeekStartDateString();
            const res = await sql.query(`SELECT *, ("messages" * 15 + "vc_minutes" * 10) as score FROM user_weekly_stats WHERE "guildID" = $1 AND "userID" != $2 AND "weekStartDate" = $3 AND ("messages" * 15 + "vc_minutes" * 10) > 0 ORDER BY score DESC`, [guild.id, OWNER_ID, weekStart]);
            allUsers = res.rows;
        } else if (type === 'daily_xp') {
            const today = getTodayDateString();
            const res = await sql.query(`SELECT *, ("messages" * 15 + "vc_minutes" * 10) as score FROM user_daily_stats WHERE "guildID" = $1 AND "userID" != $2 AND "date" = $3 AND ("messages" * 15 + "vc_minutes" * 10) > 0 ORDER BY score DESC`, [guild.id, OWNER_ID, today]);
            allUsers = res.rows;
        } else if (type === 'monthly_xp') {
            const monthStart = getMonthStartDateString();
            const res = await sql.query(`SELECT "userID" as "user", SUM("messages") as total_messages, SUM("vc_minutes") as total_vc, SUM("messages" * 15 + "vc_minutes" * 10) as score FROM user_daily_stats WHERE "guildID" = $1 AND "userID" != $2 AND "date" >= $3 GROUP BY "userID" HAVING SUM("messages" * 15 + "vc_minutes" * 10) > 0 ORDER BY score DESC`, [guild.id, OWNER_ID, monthStart]);
            allUsers = res.rows;
        } else if (type === 'mora') {
            const res = await sql.query(`
                SELECT "user", "mora", "bank", 
                (CAST("mora" AS NUMERIC) + CAST("bank" AS NUMERIC))::TEXT as total_wealth 
                FROM levels 
                WHERE "guild" = $1 AND "user" != $2 
                ORDER BY (CAST("mora" AS NUMERIC) + CAST("bank" AS NUMERIC)) DESC`, [guild.id, OWNER_ID]);
            allUsers = res.rows;
        } else if (type === 'streak') {
            const res = await sql.query(`SELECT "userID" as "user", "streakCount" FROM streaks WHERE "guildID" = $1 AND "userID" != $2 AND "streakCount" > 0 ORDER BY "streakCount" DESC`, [guild.id, OWNER_ID]);
            allUsers = res.rows;
        } else if (type === 'media_streak') {
            const res = await sql.query(`SELECT "userID" as "user", "streakCount" FROM media_streaks WHERE "guildID" = $1 AND "userID" != $2 AND "streakCount" > 0 ORDER BY "streakCount" DESC`, [guild.id, OWNER_ID]);
            allUsers = res.rows;
        } else if (type === 'achievements') {
            const res = await sql.query(`SELECT "userID" as "user", COUNT(*) as count FROM user_achievements WHERE "guildID" = $1 AND "userID" != $2 GROUP BY "userID" ORDER BY count DESC`, [guild.id, OWNER_ID]);
            allUsers = res.rows;
        } else if (type === 'strongest') {
            const weaponsRes = await sql.query(`SELECT * FROM user_weapons WHERE "guildID" = $1 AND "userID" != $2`, [guild.id, OWNER_ID]);
            const weapons = weaponsRes.rows;
            const lvlRes = await sql.query(`SELECT "user", "level" FROM levels WHERE "guild" = $1`, [guild.id]);
            const levelsMap = new Map(lvlRes.rows.map(r => [r.user, Number(r.level)]));
            const skillsRes = await sql.query(`SELECT "userID", SUM("skillLevel") as "totalLevels" FROM user_skills WHERE "guildID" = $1 GROUP BY "userID"`, [guild.id]);
            const skillsMap = new Map(skillsRes.rows.map(r => [r.userID || r.userid, parseInt(r.totalLevels || r.totallevels) || 0]));
            let stats = [];
            for (const w of weapons) {
                const conf = weaponsConfig.find(c => c.race === (w.raceName || w.racename));
                if(!conf) continue;
                const dmg = conf.base_damage + (conf.damage_increment * (Number(w.weaponLevel || w.weaponlevel) - 1));
                const uid = w.userID || w.userid;
                const playerLevel = levelsMap.get(uid) || 1;
                const hp = PROFILE_BASE_HP + (playerLevel * PROFILE_HP_PER_LEVEL);
                const skillLevelsTotal = skillsMap.get(uid) || 0;
                const powerScore = Math.floor(dmg + (hp * 0.5) + (playerLevel * 10) + (skillLevelsTotal * 20));
                stats.push({ user: uid, damage: dmg, hp, level: playerLevel, skillLevels: skillLevelsTotal, powerScore });
            }
            allUsers = stats.sort((a, b) => b.powerScore - a.powerScore);
        }

        if (targetUserId && targetUserId !== OWNER_ID) {
            const index = allUsers.findIndex(u => (u.user || u.userID || u.userid) === targetUserId);
            if (index !== -1) page = Math.ceil((index + 1) / ROWS_PER_PAGE);
        } else if (targetUserId === OWNER_ID) {
            page = 1;
        }

        const totalPages = Math.ceil(allUsers.length / ROWS_PER_PAGE) || 1;
        page = Math.max(1, Math.min(page, totalPages));

        let totalMora = null;
        if (type === 'mora') {
            const tmRes = await sql.query(`SELECT SUM(CAST("mora" AS NUMERIC) + CAST("bank" AS NUMERIC))::TEXT as t FROM levels WHERE "guild" = $1 AND "user" != $2`, [guild.id, OWNER_ID]);
            totalMora = tmRes.rows[0]?.t ? BigInt(tmRes.rows[0].t).toLocaleString() : "0";
        }

        const pageDataRaw = allUsers.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);
        
        const enrichedData = await Promise.all(pageDataRaw.map(async (u) => {
            const uid = u.user || u.userID || u.userid;
            let dUser = client.users.cache.get(uid);
            if (!dUser) { 
                try { dUser = await client.users.fetch(uid); } catch(e){} 
            }
            
            if (type === 'mora' && u.total_wealth) {
                u.total_wealth_formatted = BigInt(u.total_wealth).toLocaleString();
            }

            return {
                uid: uid,
                db: u,
                name: dUser ? dUser.username : "مغامر مجهول",
                avatar: dUser ? dUser.displayAvatarURL({ extension: 'png', size: 128 }) : 'https://i.postimg.cc/7PMn1v8v/discord-avatar.png'
            };
        }));

        const imageBuffer = await generateTopImage(enrichedData, type, page, totalPages, targetUserId, { totalMora });

        return { imageBuffer, totalPages, currentPage: page };

    } catch (err) {
        console.error(`[Leaderboard Error] ${type}:`, err);
        return { imageBuffer: null, totalPages: 1, currentPage: 1 };
    }
}

function createButtons(activeId, page, totalPages) {
    const rowCat = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('top_level').setEmoji('<a:levelup:1437805366048985290>').setStyle(activeId === 'level' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('top_mora').setEmoji('<:mora:1435647151349698621>').setStyle(activeId === 'mora' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('top_streak').setEmoji('🔥').setStyle((activeId === 'streak' || activeId === 'media_streak') ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('top_strongest').setEmoji('⚔️').setStyle(activeId === 'strongest' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('top_trophy').setEmoji('<a:mTrophy:1438797228826300518>').setStyle((activeId === 'rep' || activeId === 'achievements') ? ButtonStyle.Primary : ButtonStyle.Secondary)
    );

    const rowNav = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('leaderboard_prev').setEmoji('<:left:1439164494759723029>').setStyle(ButtonStyle.Secondary).setDisabled(page <= 1),
        new ButtonBuilder().setCustomId('leaderboard_find_me').setEmoji('📍').setStyle(ButtonStyle.Success), 
        new ButtonBuilder().setCustomId('leaderboard_next').setEmoji('<:right:1439164491072929915>').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages)
    );
    
    return [rowCat, rowNav];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('توب')
        .setDescription('عرض لوحات الصدارة كصورة احترافية.')
        .addStringOption(opt => opt.setName('التصنيف').setDescription('نوع الترتيب').addChoices(
            { name: 'Level', value: 'level' }, { name: 'Mora', value: 'mora' },
            { name: 'Streak', value: 'streak' }, { name: 'Strongest', value: 'strongest' },
            { name: 'Reputation', value: 'rep' }, { name: 'Achievements', value: 'achievements' }, 
            { name: 'Weekly', value: 'weekly_xp' }, { name: 'Daily', value: 'daily_xp' }, { name: 'Monthly', value: 'monthly_xp' }
        ))
        .addIntegerOption(opt => opt.setName('صفحة').setDescription('رقم الصفحة')),

    name: "top",
    aliases: ["توب", "المتصدرين", "topmora", "topstreak", "اغنى", "اقوى", "topweek", "توب-الاسبوع", "t", "lb"],
    category: "Leveling",
    cooldown: 10,
    description: "يعرض لوحات الصدارة كصورة.",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, user, channelId;
        let currentPage = 1;
        let argType = 'level'; 

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            user = interaction.user;
            channelId = interaction.channelId;
            currentPage = interaction.options.getInteger('صفحة') || 1;
            argType = interaction.options.getString('التصنيف') || 'level';
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            user = message.author;
            channelId = message.channel.id;
            
            // 🔥 تم إصلاح الخطأ هنا: تمرير guild.id لتجنب "حدث خطأ"
            const settingsRes = await client.sql.query(`SELECT "casinoChannelID" FROM settings WHERE "guild" = $1`, [guild.id]);
            const settings = settingsRes.rows[0];
            if (settings && (settings.casinoChannelID || settings.casinochannelid) === channelId) argType = 'mora'; 

            const cmd = message.content.split(' ')[0].slice(1).toLowerCase(); 
            if (cmd.includes('mora') || cmd.includes('اغنى')) argType = 'mora';
            else if (cmd.includes('streak')) argType = 'streak';
            else if (cmd.includes('week') || cmd.includes('اسبوع')) argType = 'weekly_xp';
            else if (cmd.includes('month') || cmd.includes('شهر')) argType = 'monthly_xp';
            else if (cmd.includes('daily') || cmd.includes('يومي')) argType = 'daily_xp';
            else if (cmd.includes('اقوى')) argType = 'strongest';
            else if (cmd.includes('achievements') || cmd.includes('انجازات')) argType = 'achievements';
            else if (cmd.includes('rep') || cmd.includes('سمعة')) argType = 'rep';
            
            if (args && args.length > 0) {
                const firstArg = args[0].toLowerCase();
                if (['week', 'weekly', 'w', 'اسبوع', 'اسبوعي'].includes(firstArg)) argType = 'weekly_xp';
                else if (['month', 'monthly', 'm', 'شهر', 'شهري'].includes(firstArg)) argType = 'monthly_xp';
                else if (['day', 'daily', 'd', 'يومي', 'يوم'].includes(firstArg)) argType = 'daily_xp';
                else if (['mora', 'money', 'coins', 'مورا', 'فلوس'].includes(firstArg)) argType = 'mora';
                else if (['streak', 'st', 'ستريك'].includes(firstArg)) argType = 'streak';
                else if (['achievements', 'ach', 'انجازات'].includes(firstArg)) argType = 'achievements';
                else if (['rep', 'reputation', 'سمعة', 'السمعة'].includes(firstArg)) argType = 'rep';
                
                const potentialPage = parseInt(firstArg);
                if (!isNaN(potentialPage)) currentPage = potentialPage;
                else if (args[1] && !isNaN(parseInt(args[1]))) currentPage = parseInt(args[1]);
            }
            
            message.channel.sendTyping();
        }

        const sql = client.sql;

        const data = await fetchLeaderboardData(client, sql, guild, argType, currentPage);
        currentPage = data.currentPage;
        
        let payload = { components: createButtons(argType, currentPage, data.totalPages) };
        if (data.imageBuffer) {
            payload.files = [new AttachmentBuilder(data.imageBuffer, { name: 'leaderboard.png' })];
        } else {
            payload.content = "❌ خطأ في تحميل بيانات الصورة.";
        }

        let msg;
        if (isSlash) {
            msg = await interaction.editReply(payload);
        } else {
            msg = await message.reply(payload);
        }

        const collector = msg.createMessageComponentCollector({ 
            componentType: ComponentType.Button, 
            idle: 60000 
        });

        collector.on('collect', async i => {
            if (i.user.id !== user.id) return i.reply({ content: "هذه القائمة ليست لك.", ephemeral: true });
            
            await i.deferUpdate(); 

            if (i.customId === 'leaderboard_next') currentPage++;
            else if (i.customId === 'leaderboard_prev') currentPage--;
            else if (i.customId === 'leaderboard_find_me') {
                const findData = await fetchLeaderboardData(client, sql, guild, argType, 1, user.id);
                if (findData.totalPages === 0) return i.followUp({ content: "لست موجوداً في هذا التصنيف!", ephemeral: true });
                currentPage = findData.currentPage; 
            } 
            else if (i.customId.startsWith('top_')) {
                const clicked = i.customId.replace('top_', '');
                
                if (clicked === 'level') {
                    if (argType === 'level') argType = 'weekly_xp';
                    else if (argType === 'weekly_xp') argType = 'monthly_xp';
                    else if (argType === 'monthly_xp') argType = 'daily_xp';
                    else argType = 'level';
                } else if (clicked === 'streak') {
                    argType = (argType === 'streak') ? 'media_streak' : 'streak';
                } else if (clicked === 'trophy') {
                    argType = (argType === 'rep') ? 'achievements' : 'rep';
                } else {
                    argType = clicked;
                }
                currentPage = 1;
            }

            const newData = await fetchLeaderboardData(client, sql, guild, argType, currentPage, (i.customId === 'leaderboard_find_me' ? user.id : null));
            
            let updatePayload = { components: createButtons(argType, newData.currentPage, newData.totalPages), content: '' };
            if (newData.imageBuffer) {
                updatePayload.files = [new AttachmentBuilder(newData.imageBuffer, { name: 'leaderboard.png' })];
            } else {
                updatePayload.content = "❌ لا توجد بيانات.";
                updatePayload.files = [];
            }

            await i.editReply(updatePayload);
            currentPage = newData.currentPage; 
        });

        collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
    },
    fetchLeaderboardData
};
