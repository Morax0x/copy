const { 
    EmbedBuilder, 
    SlashCommandBuilder, 
    MessageFlags, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ComponentType 
} = require("discord.js");
const SQLite = require("better-sqlite3");
const path = require('path');

// استدعاء ملف إعدادات الصيد لحساب الكولداون الديناميكي
const rootDir = process.cwd();
let fishingConfig = { rods: [], boats: [] };
try {
    fishingConfig = require(path.join(rootDir, 'json', 'fishing-config.json'));
} catch (e) {
    console.warn("[GameTime] Could not load fishing-config.json, using defaults.");
    fishingConfig.rods = [{ level: 1, cooldown: 300000 }]; 
    fishingConfig.boats = [{ level: 1, speed_bonus: 0 }];
}

const EMOJI_READY = '🟢';
const EMOJI_WAIT = '🔴';

function formatTimeSimple(ms) {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// دالة لحساب الوقت المتبقي لمنتصف الليل بتوقيت السعودية (للراتب)
function getTimeUntilNextMidnightKSA() {
    const now = new Date();
    const ksaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Riyadh' }));
    const nextMidnight = new Date(ksaTime);
    nextMidnight.setHours(24, 0, 0, 0); 
    return nextMidnight.getTime() - ksaTime.getTime();
}

// دالة لمعرفة تاريخ اليوم بتوقيت السعودية
function getKSADateString(timestamp) {
    return new Date(timestamp).toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
}

// قائمة الأوامر الثابتة
const COMMANDS_TO_CHECK = [
    { name: 'work', db_column: 'lastWork', cooldown: 1 * 60 * 60 * 1000, label: 'عمل' },
    { name: 'rob', db_column: 'lastRob', cooldown: 1 * 60 * 60 * 1000, label: 'سرقة' },
    { name: 'rps', db_column: 'lastRPS', cooldown: 1 * 60 * 60 * 1000, label: 'حجرة' },
    { name: 'guess', db_column: 'lastGuess', cooldown: 1 * 60 * 60 * 1000, label: 'خمن' },
    { name: 'roulette', db_column: 'lastRoulette', cooldown: 1 * 60 * 60 * 1000, label: 'روليت' },
    { name: 'emoji', db_column: 'lastMemory', cooldown: 1 * 60 * 60 * 1000, label: 'ايموجي' }, 
    { name: 'arrange', db_column: 'lastArrange', cooldown: 1 * 60 * 60 * 1000, label: 'ترتيب' },
    { name: 'pvp', db_column: 'lastPVP', cooldown: 5 * 60 * 1000, label: 'تحدي' },
    { name: 'race', db_column: 'lastRace', cooldown: 1 * 60 * 60 * 1000, label: 'سباق' }, 
    { name: 'dungeon', db_column: 'last_dungeon', cooldown: 1 * 60 * 60 * 1000, label: 'دانجون' } 
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('وقت')
        .setDescription('يعرض الوقت المتبقي لاستخدام أوامر الاقتصاد.')
        .addUserOption(option =>
            option.setName('المستخدم')
            .setDescription('عرض أوقات مستخدم آخر (اختياري)')
            .setRequired(false)),

    name: 'gametime',
    aliases: ['وقت', 'وقت الالعاب', 'cooldown', 'cd'],
    category: "Economy",
    description: 'يعرض الوقت المتبقي لاستخدام أوامر الاقتصاد.',

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, client, guild;
        let targetUser;
        let originalUser; // المستخدم الذي نفذ الأمر

        try {
            if (isSlash) {
                interaction = interactionOrMessage;
                client = interaction.client;
                guild = interaction.guild;
                targetUser = interaction.options.getUser('المستخدم') || interaction.user;
                originalUser = interaction.user;
                await interaction.deferReply();
            } else {
                message = interactionOrMessage;
                client = message.client;
                guild = message.guild;
                targetUser = message.mentions.users.first() || message.author;
                originalUser = message.author;
            }

            const getScore = client.getLevel;
            let data = getScore.get(targetUser.id, guild.id);
            if (!data) {
                data = { ...client.defaultData, user: targetUser.id, guild: guild.id };
            }

            const now = Date.now();
            
            // مصفوفتان لتخزين الألعاب المتاحة وغير المتاحة
            const readyGames = [];
            const waitGames = [];

            // 1. معالجة خاصة للراتب (Daily)
            const lastDaily = data.lastDaily || 0;
            const todayKSA = getKSADateString(now);
            const lastDailyKSA = getKSADateString(lastDaily);

            if (todayKSA === lastDailyKSA) {
                const timeUntilMidnight = getTimeUntilNextMidnightKSA();
                waitGames.push(`${EMOJI_WAIT} **راتب**: \`${formatTimeSimple(timeUntilMidnight)}\``);
            } else {
                readyGames.push(`${EMOJI_READY} **راتب**`);
            }

            // 2. حساب الأوامر الثابتة
            for (const cmd of COMMANDS_TO_CHECK) {
                const lastUsed = data[cmd.db_column] || 0;
                const cooldownAmount = cmd.cooldown;
                const timeLeft = lastUsed + cooldownAmount - now;

                if (timeLeft > 0) {
                    waitGames.push(`${EMOJI_WAIT} **${cmd.label}**: \`${formatTimeSimple(timeLeft)}\``);
                } else {
                    readyGames.push(`${EMOJI_READY} **${cmd.label}**`);
                }
            }

            // 3. 🎣 حساب كولداون الصيد (ديناميكي)
            const userRodLevel = data.rodLevel || 1;
            const userBoatLevel = data.boatLevel || 1;

            const currentRod = fishingConfig.rods.find(r => r.level === userRodLevel) || fishingConfig.rods[0];
            const currentBoat = fishingConfig.boats.find(b => b.level === userBoatLevel) || fishingConfig.boats[0];

            let fishCooldown = currentRod.cooldown - (currentBoat.speed_bonus || 0);
            if (fishCooldown < 10000) fishCooldown = 10000;

            const lastFish = data.lastFish || 0;
            const fishTimeLeft = lastFish + fishCooldown - now;

            if (fishTimeLeft > 0) {
                waitGames.push(`${EMOJI_WAIT} **صيد**: \`${formatTimeSimple(fishTimeLeft)}\``);
            } else {
                readyGames.push(`${EMOJI_READY} **صيد**`);
            }

            // بناء الإيمبد الرئيسي
            const embed = new EmbedBuilder()
                .setTitle('✥ وقـت الالعـاب')
                .setColor("Random")
                .setThumbnail('https://i.postimg.cc/zGqbJNzm/ayqwnt.png') // الصورة الصغيرة
                .setDescription(`
✶ اختر الزر المناسب أدناه لعرض الوقت المتبقي لكل لعبة

✶ الالعاب المتـاحـة: ${EMOJI_READY}
✶ الالعاب الغير متـاحة: ${EMOJI_WAIT}
                `)
                .setTimestamp();

            // بناء الأزرار
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('show_ready')
                    .setLabel('الألعاب المتاحة')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji(EMOJI_READY),
                new ButtonBuilder()
                    .setCustomId('show_wait')
                    .setLabel('أوقات الانتظار')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji(EMOJI_WAIT)
            );

            // إرسال الرسالة
            let sentMessage;
            if (isSlash) {
                sentMessage = await interaction.editReply({ embeds: [embed], components: [row] });
            } else {
                sentMessage = await message.channel.send({ embeds: [embed], components: [row] });
            }

            // إنشاء كوليكتور للأزرار
            const collector = sentMessage.createMessageComponentCollector({ 
                componentType: ComponentType.Button, 
                time: 60000 // الأزرار تعمل لمدة دقيقة
            });

            collector.on('collect', async (i) => {
                // التأكد من أن الشخص الذي ضغط هو من طلب الأمر (اختياري، يمكن إزالته ليتمكن الجميع من الرؤية)
                if (i.user.id !== originalUser.id) {
                    return i.reply({ content: "🚫 هذا الأمر ليس لك.", ephemeral: true });
                }

                if (i.customId === 'show_ready') {
                    const content = readyGames.length > 0 
                        ? `**✅ القائمة المتاحة لـ ${targetUser.username}:**\n\n${readyGames.join('\n')}` 
                        : `❌ لا توجد ألعاب متاحة حالياً لـ ${targetUser.username}..`;
                    
                    await i.reply({ content: content, ephemeral: true });
                } 
                else if (i.customId === 'show_wait') {
                    const content = waitGames.length > 0 
                        ? `**⏳ قائمة الانتظار لـ ${targetUser.username}:**\n\n${waitGames.join('\n')}` 
                        : `🎉 كل الألعاب متاحة لـ ${targetUser.username}!`;

                    await i.reply({ content: content, ephemeral: true });
                }
            });

            collector.on('end', () => {
                // تعطيل الأزرار بعد انتهاء الوقت
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('show_ready').setLabel('الألعاب المتاحة').setStyle(ButtonStyle.Success).setEmoji(EMOJI_READY).setDisabled(true),
                    new ButtonBuilder().setCustomId('show_wait').setLabel('أوقات الانتظار').setStyle(ButtonStyle.Danger).setEmoji(EMOJI_WAIT).setDisabled(true)
                );
                
                if (isSlash) {
                    interaction.editReply({ components: [disabledRow] }).catch(() => {});
                } else {
                    sentMessage.edit({ components: [disabledRow] }).catch(() => {});
                }
            });

        } catch (error) {
            console.error("Error in gametime command:", error);
            const errorPayload = { content: "حدث خطأ أثناء جلب الأوقات.", flags: [MessageFlags.Ephemeral] };
            if (isSlash) {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(errorPayload);
                } else {
                    await interaction.reply(errorPayload);
                }
            } else {
                message.reply(errorPayload.content);
            }
        }
    }
};
