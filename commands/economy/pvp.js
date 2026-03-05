const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, SlashCommandBuilder, MessageFlags } = require("discord.js");
const { activePvpChallenges, getUserRace, getWeaponData, cleanDisplayName } = require('../../handlers/pvp-core.js');

let updateGuildStat;
try {
    ({ updateGuildStat } = require('../../handlers/guild-board-handler.js'));
} catch (e) {}

const EMOJI_MORA = '<:mora:1435647151349698621>';
const PVP_COOLDOWN_MS = 5 * 60 * 1000;
const MAX_LOAN_BET = 500; 

const CHALLENGE_IMAGES = [
    'https://i.postimg.cc/5NX6dF4R/download-2.gif',
    'https://i.postimg.cc/5NWNGKRR/download-3.gif',
    'https://i.postimg.cc/xTPYZfH6/download-4.gif',
    'https://i.postimg.cc/vBwNM9wf/download-6.gif',
    'https://i.postimg.cc/wTrFgJhJ/Okita-Sougo.gif',
    'https://i.postimg.cc/5NXq70ZV/Shiki-Ryougi.gif',
    'https://i.postimg.cc/0QNJzXv1/Anime-Anger-GIF-Anime-Anger-ANGRY-Descobrir-e-Compartilhar-GIFs.gif',
    'https://i.postimg.cc/3xCynQrf/download-7.gif',
    'https://i.postimg.cc/Sxq7Ghbg/download-8.gif',
    'https://i.postimg.cc/htHCbxvn/Tsubaki-Who-is-coming-Servamp.gif'
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('تحدي')
        .setDescription('تحدي عضو آخر في قتال 1 ضد 1 على رهان مورا.')
        .addUserOption(option => 
            option.setName('المستخدم')
            .setDescription('الخصم الذي تريد تحديه')
            .setRequired(true))
        .addIntegerOption(option =>
            option.setName('المبلغ')
            .setDescription('مبلغ المورا الذي تراهن به')
            .setRequired(true)
            .setMinValue(1)),

    name: 'pvp',
    aliases: ['قتال', 'تحدي'],
    category: "Economy",
    description: 'تحدي عضو آخر في قتال 1 ضد 1 على رهان مورا.',

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, challenger;
        let opponent, bet;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            challenger = interaction.member;
            opponent = interaction.options.getMember('المستخدم');
            bet = interaction.options.getInteger('المبلغ');
            await interaction.deferReply(); 
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            challenger = message.member;

            opponent = message.mentions.members.first();
            const betArg = args[1];

            if (!opponent || !betArg || isNaN(parseInt(betArg))) {
                return message.reply(`الاستخدام: \`-pvp <@User> <المبلغ>\``);
            }
            bet = parseInt(betArg);
        }

        const replyError = async (content) => {
            if (isSlash) {
                return interaction.editReply({ content, flags: [MessageFlags.Ephemeral] });
            } else {
                return message.reply({ content });
            }
        };

        const sendChallenge = async (payload) => {
            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.channel.send(payload);
            }
        };

        const channel = interactionOrMessage.channel;
        const db = client.sql; 
        
        if (bet <= 0) {
            return replyError("مبلغ الرهان يجب أن يكون رقماً موجباً.");
        }

        if (opponent.id === challenger.id) {
            return replyError("متـوحـد انـت؟ تتحدى نفسـك؟ <a:MugiStronk:1438795606872166462>");
        }

        if (opponent.user.bot) {
            return replyError("ما تقدر تتحدى بـوت يا متـخـلف <a:MugiStronk:1438795606872166462>");
        }

        if (bet > MAX_LOAN_BET) {
            let challengerLoan = null;
            try {
                const res = await db.query("SELECT remainingAmount FROM user_loans WHERE userID = $1 AND guildID = $2", [challenger.id, guild.id]);
                challengerLoan = res.rows[0];
            } catch(e) {}
            
            if (challengerLoan && Number(challengerLoan.remainingamount || challengerLoan.remainingAmount) > 0) {
                return replyError(`❌ **عذراً!** عليك قرض لم يتم سداده.\nلا يمكنك المراهنة بأكثر من **${MAX_LOAN_BET}** ${EMOJI_MORA} في التحديات حتى تسدد قرضك.`);
            }
        }

        if (bet > MAX_LOAN_BET) {
            let opponentLoan = null;
            try {
                const res = await db.query("SELECT remainingAmount FROM user_loans WHERE userID = $1 AND guildID = $2", [opponent.id, guild.id]);
                opponentLoan = res.rows[0];
            } catch(e) {}

            if (opponentLoan && Number(opponentLoan.remainingamount || opponentLoan.remainingAmount) > 0) {
                return replyError(`❌ الخصم ${opponent.displayName} عليه قرض ولا يمكنه المراهنة بأكثر من **${MAX_LOAN_BET}** ${EMOJI_MORA}.`);
            }
        }

        let challengerData = await client.getLevel(challenger.id, guild.id);
        if (!challengerData) {
            challengerData = { ...client.defaultData, user: challenger.id, guild: guild.id };
        }

        let opponentData = await client.getLevel(opponent.id, guild.id);
        if (!opponentData) {
            opponentData = { ...client.defaultData, user: opponent.id, guild: guild.id };
        }

        const now = Date.now();

        let woundedDebuff = null;
        try {
            const res = await db.query("SELECT * FROM user_buffs WHERE userID = $1 AND guildID = $2 AND buffType = 'pvp_wounded' AND expiresAt > $3", [challenger.id, guild.id, now]);
            woundedDebuff = res.rows[0];
        } catch(e) {}

        if (woundedDebuff) {
            const woundTimeLeft = Math.ceil((Number(woundedDebuff.expiresat || woundedDebuff.expiresAt) - now) / 60000);
            return replyError(`❌ | أنت جريح حالياً! 🤕\nيمـكنـك تلقـي التحديـات ولكن لا يمـكـنـك ارسالـهـا ستشفـى بالكـامل بعـد **${woundTimeLeft}**دقيقـة`);
        }

        const timeLeft = (Number(challengerData.lastPVP) || 0) + PVP_COOLDOWN_MS - now;
        const executorId = isSlash ? interaction.user.id : message.author.id;

        if (timeLeft > 0 && executorId !== "1145327691772481577") {
            const minutes = Math.floor(timeLeft / 60000);
            const seconds = Math.floor((timeLeft % 60000) / 1000);
            return replyError(`🕐 لقد قمت بقتال مؤخراً. يرجى الانتظار **${minutes} دقيقة و ${seconds} ثانية**.`);
        }

        if (Number(challengerData.mora) < bet) {
            return replyError(`ليس لديك **${bet.toLocaleString()}** ${EMOJI_MORA} في رصيدك (الكاش) لهذا الرهان!`);
        }
        if (Number(opponentData.mora) < bet) {
            return replyError(`خصمك ${opponent.displayName} لا يملك **${bet.toLocaleString()}** ${EMOJI_MORA} في رصيده (الكاش).`);
        }

        const challengerRace = await getUserRace(challenger, db);
        const challengerWeapon = await getWeaponData(db, challenger);

        if (!challengerRace || !challengerWeapon || challengerWeapon.currentLevel === 0) {
            return replyError(`❌ | لا يمكنك بدء تحدٍ وأنت لست جاهزاً! (تحتاج إلى عرق + سلاح مستوى 1 على الأقل).`);
        }

        challengerData.lastPVP = Date.now();
        await client.setLevel(challengerData);

        activePvpChallenges.add(channel.id);

        const totalPot = bet * 2;

        const challengerName = cleanDisplayName(challenger.user.displayName);
        const opponentName = cleanDisplayName(opponent.user.displayName);

        const randomChallengeImage = CHALLENGE_IMAGES[Math.floor(Math.random() * CHALLENGE_IMAGES.length)];

        const embed = new EmbedBuilder()
            .setTitle('⚔️ تحـدي قـتـال ⚔️')
            .setColor(Colors.Orange)
            .setDescription(
                `**${challengerName}** يتحدى **${opponentName}** في قتال 1 ضد 1!\n\n` +
                `✬**الــرهان:** **${bet.toLocaleString()}** ${EMOJI_MORA}\n` +
                `✬**الجائزة الكبرى:** **${totalPot.toLocaleString()}** ${EMOJI_MORA}\n\n` +
                `✬ ${opponent}، لديك 60 ثانية لقبول التحدي.`
            )
            .setImage(randomChallengeImage)
            .setThumbnail(challenger.displayAvatarURL());

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`pvp_accept_${challenger.id}_${opponent.id}_${bet}`)
                .setLabel('قــبـــول')
                .setStyle(ButtonStyle.Success)
                .setEmoji('⚔️'),
            new ButtonBuilder()
                .setCustomId(`pvp_decline_${challenger.id}_${opponent.id}_${bet}`)
                .setLabel('رفــــض')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🛡️')
        );

        const challengeMsg = await sendChallenge({ content: `${opponent}`, embeds: [embed], components: [row] });

        setTimeout(async () => {
            if (activePvpChallenges.has(channel.id)) {
                activePvpChallenges.delete(channel.id);

                const editPayload = {
                    content: 'انـتهـى الـوقـت لم يقـبل التحدي',
                    embeds: [],
                    components: []
                };

                if (isSlash) {
                    interaction.editReply(editPayload).catch(() => {});
                } else {
                    challengeMsg.edit(editPayload).catch(() => {});
                }

                challengerData.lastPVP = 0;
                await client.setLevel(challengerData);
            }
        }, 60000);
    }
};
