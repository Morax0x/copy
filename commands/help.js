const { 
    EmbedBuilder, 
    PermissionsBitField, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ComponentType, 
    SlashCommandBuilder, 
    MessageFlags 
} = require("discord.js");

const HELP_THUMBNAIL = 'https://i.postimg.cc/mkCr3Xwr/download-(1).jpg'; // الصورة الصغيرة
const HELP_EMOJI = '<:mora:1435647151349698621>'; // إيموجي الزر

// (مترجم الأوصاف الإدارية والأوامر الجديدة)
const DESCRIPTION_TRANSLATIONS = new Map([
    ['mora-admin', 'تعديل رصيد المورا لعضو (إضافة/إزالة)'],
    ['xp', 'التحكم بنقاط الخبرة (إضافة/إزالة)'],
    ['add-level', 'إضافة مستويات لعضو معين'],
    ['remove-level', 'إزالة مستويات من عضو معين'],
    ['set-level', 'تحديد مستوى لعضو معين'],
    ['set-streak', 'تعديل ستريك عضو معين'],
    ['give-shield', 'إعطاء درع ستريك لعضو'],
    ['give-buff', 'إعطاء معزز خبرة/مورا لعضو'],
    ['prefix', 'تغيير بريفكس البوت'],
    ['blacklist', 'حظر عضو أو رتبة من استخدام البوت'],
    ['xpsettings', 'التحكم بإعدادات نقاط الخبرة النصية'],
    ['vxpsettings', 'التحكم بإعدادات نقاط الخبرة الصوتية'],
    ['set-vip-role', 'تحديد رتبة الـ VIP الخاصة بالمتجر'],
    ['set-casino-room', 'تحديد قناة الكازينو (لأوامر المقامرة)'],
    ['setquestchannel', 'تحديد قناة إشعارات المهمات والإنجازات'],
    ['setup-quest-panel', 'نشر لوحة المهمات التفاعلية'],
    ['setlevelchannel', 'تحديد قناة إشعارات اللفل أب'],
    ['custom-rank', 'تخصيص بطاقة الرانك (VIP)'],
    ['set-role-buff', 'تحديد معزز خبرة لرتبة معينة'],
    ['setlevelmessage', 'تخصيص رسالة اللفل أب'],
    ['post-achievements-msg', 'نشر رسالة لوحة الإنجازات'],
    ['set-achievement-channel', 'تحديد قناة الإنجازات'],
    ['set-quest-configs', 'تعديل إعدادات المهمات (للمطور)'],
    ['set-race-role', 'تحديد رتب العرق للـ PvP'],
    ['set-streak-emoji', 'تغيير إيموجي الستريك'],
    ['setup-streak-panel', 'نشر لوحة الستريك التفاعلية'],
    ['checkdb', 'فحص قاعدة البيانات (للمطور)'],
    ['reroll', 'إعادة سحب فائز في قيف اواي'],
    ['set-shop-log', 'تحديد قناة سجلات المتجر'],
    ['boss', 'التحكم في وحش العالم (للمالك)'],
    ['dungeon', 'دخول الدانجون (PvE) لمحاربة الوحوش'],
    ['arrange', 'لعبة ترتيب الأرقام (سرعة وذاكرة)'],
    ['race', 'سباق الخيول (فردي وجماعي)'],
    ['colors', 'يظهر لوحة الالوان لتغيير لون اسمك بالسيرفر'], 
    ['top', 'عرض قائمة المتصدرين (مورا/لفل/ستريك)']
]);

// خريطة للأسماء العربية اليدوية
const MANUAL_ARABIC_NAMES = new Map([
    ['level', 'مستوى'],
    ['top', 'توب'],
    ['profile', 'بروفايل'],
    ['balance', 'رصيد'],
    ['bank', 'بنك'],
    ['deposit', 'ايداع'],
    ['withdraw', 'سحب'],
    ['daily', 'راتب'],
    ['loan', 'قرض'],
    ['payloan', 'سداد'],
    ['market', 'سوق'],
    ['portfolio', 'ممتلكات'],
    ['transfer', 'تحويل'],
    ['farm', 'مزرعة'],
    ['myfarm', 'مزرعتي'],
    ['work', 'عمل'],
    ['rps', 'حجرة'],
    ['roulette', 'روليت'],
    ['rob', 'سرقة'],
    ['guess', 'خمن'],
    ['gametime', 'وقت'],
    ['pvp', 'تحدي'],
    ['my-skills', 'عتاد'],
    ['weapon-info', 'سلاح'],
    ['shop', 'متجر'],
    ['fish', 'صيد'],
    ['emoji', 'ايموجي'],
    ['boss', 'وحش'],
    ['dungeon', 'دانجون'],
    ['arrange', 'ترتيب'],
    ['race', 'سباق'],
    ['colors', 'الوان']
]);

function getArabicDescription(cmd) {
    if (!cmd) return 'لا يوجد وصف';
    const translated = DESCRIPTION_TRANSLATIONS.get(cmd.name);
    if (translated) return translated;
    const hasArabic = /[\u0600-\u06FF]/.test(cmd.description);
    if (cmd.description && hasArabic) return cmd.description;
    return cmd.description || 'لا يوجد وصف';
}

function getCmdName(commands, name) {
    if (MANUAL_ARABIC_NAMES.has(name)) {
        return MANUAL_ARABIC_NAMES.get(name);
    }
    const cmd = commands.get(name);
    if (!cmd) return name; 

    let arabicAlias = null;
    if (cmd.aliases && Array.isArray(cmd.aliases)) {
        arabicAlias = cmd.aliases.find(a => /[\u0600-\u06FF]/.test(a));
    }
    return arabicAlias || cmd.name;
}

function buildCasinoEmbed(client) {
    const commands = client.commands;
    const desc = `
**❖ اوامـر الكـازينـو**

✶** ${getCmdName(commands, 'balance')}: ** \`يعرض رصيدك الكاش ورصيد البنك\`
✶** ${getCmdName(commands, 'bank')}: ** \`تقريرك الائتماني والفوائد اليومية\`
✶** ${getCmdName(commands, 'deposit')}: ** \`لـ ايداع رصيدك في البنك\`
✶** ${getCmdName(commands, 'withdraw')}: ** \`لسحب رصيدك من البنك\`
✶** ${getCmdName(commands, 'daily')}: ** \`لـ استلام راتبك اليومي\`
✶** ${getCmdName(commands, 'loan')}: ** \`للحصول على قرض من البنك\`
✶** ${getCmdName(commands, 'payloan')}: ** \`لدفع قسط من قرضك\`
✶** ${getCmdName(commands, 'market')}: ** \`عرض سوق الاسهم والاستثمارات\`
✶** ${getCmdName(commands, 'portfolio')}: ** \`استعراض استثماراتك و اصولك\`
✶** ${getCmdName(commands, 'transfer')}: ** \`لتحويل رصيد المورا لمستخدم آخر\`
✶** ${getCmdName(commands, 'farm')}: ** \`عرض سوق المزرعة لشراء الحيوانات\`
✶** ${getCmdName(commands, 'myfarm')}: ** \`عرض مزرعتك الخاصة والحيوانات لديك\`
✶** ${getCmdName(commands, 'work')}: ** \`للعمل وكسب المورا مرة كل ساعة\`
✶** ${getCmdName(commands, 'rps')}: ** \`لعب حجرة ورقة مقص\`
✶** ${getCmdName(commands, 'roulette')}: ** \`للعب الروليت الروسية ومضاعفة رهانك\`
✶** ${getCmdName(commands, 'emoji')}: ** \`لعبة تحدي الذاكرة (إيموجي)\`
✶** ${getCmdName(commands, 'rob')}: ** \`لسرقة ونهب رصيد مستخدم آخر\`
✶** ${getCmdName(commands, 'guess')}: ** \`لعبة تخمين الرقم فردي او جماعي\`
✶** ${getCmdName(commands, 'race')}: ** \`لعبة سباق الخيول فردي او جماعي\`
✶** ${getCmdName(commands, 'arrange')}: ** \`لعبة ترتيب الأرقام (سرعة)\`
✶** ${getCmdName(commands, 'gametime')}: ** \`لاظهار فترة التهدئة لأوامر الكازينو\`
✶** ${getCmdName(commands, 'fish')}: ** \`صيد السمك وكسب المورا\`

**❖ اوامـر الـقـتـال والـمـغـامـرة**
✶** ${getCmdName(commands, 'dungeon')}: ** \`دخول الدانجون ومحاربة الوحوش (PvE)\`
✶** ${getCmdName(commands, 'pvp')}: ** \`قتال وتحدي شخص آخر والمراهنة\`
✶** ${getCmdName(commands, 'my-skills')}: ** \`لعرض عتادك القتالي ومهاراتك\`
✶** ${getCmdName(commands, 'weapon-info')}: ** \`لعرض تفاصيل سلاح العرق الخاص بك\`
✶** ${getCmdName(commands, 'shop')}: ** \`يوجهك لمتجر السيرفر لاستبدال المورا بالعناصر\`
    `;

    return new EmbedBuilder()
        .setColor("Red")
        .setThumbnail(HELP_THUMBNAIL)
        .setDescription(desc);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('مساعدة')
        .setDescription('عرض قائمة المساعدة التفاعلية.')
        .addStringOption(option =>
            option.setName('اسم-الامر')
            .setDescription('عرض تفاصيل أمر معين')
            .setRequired(false)
            .setAutocomplete(true)), 

    name: "help",
    aliases: ["h", "مساعدة", "help","اوامر",],
    category: "Utility",
    cooldown : 5,
    description: "Display Help Commands",

    async autocomplete(interaction) {
        try {
            const focusedValue = interaction.options.getFocused().toLowerCase();
            const commands = interaction.client.commands;
            const filtered = commands.filter(cmd => 
                cmd.name.toLowerCase().includes(focusedValue)
            ).map(cmd => ({
                name: cmd.name,
                value: cmd.name
            }));
            await interaction.respond(filtered.slice(0, 25));
        } catch (e) {}
    },

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, user;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            user = interaction.user;
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            user = message.author;
        }

        const reply = async (payload) => {
            if (isSlash) return interaction.editReply(payload);
            return message.channel.send(payload);
        }

        const replyError = async (content) => {
            const payload = { content, ephemeral: true };
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };

        const sql = client.sql; 
        const { commands } = client;

        let prefix = "-"; 
        try {
            const prefixRow = sql.prepare("SELECT serverprefix FROM prefix WHERE guild = ?").get(guild.id);
            if (prefixRow && prefixRow.serverprefix) prefix = prefixRow.serverprefix;
        } catch (e) {}

        if (!guild.members.me.permissions.has(PermissionsBitField.Flags.EmbedLinks)) {
            return replyError(`Missing Permission: EMBED_LINKS`);
        }

        let commandNameArg = null;
        if (isSlash) {
            commandNameArg = interaction.options.getString('اسم-الامر');
        } else if (args && args.length > 0) {
            commandNameArg = args[0].toLowerCase();
        }

        // 1. عرض تفاصيل أمر معين (إذا تم تحديده)
        if (commandNameArg) {
            const name = commandNameArg.toLowerCase();
            const command = commands.get(name) || commands.find(c => c.aliases && c.aliases.includes(name));

            if (!command) {
                return replyError('هذا الأمر غير موجود!');
            }

            const displayName = getCmdName(commands, command.name);
            const aliases = command.aliases ? command.aliases.map(a => `\`${a}\``).join(", ") : "لا يوجد";

            let embed = new EmbedBuilder()
                .setTitle(displayName)
                .setColor("Random")
                .setFooter({ text: 'الأقواس <> تعني إجباري، [] تعني اختياري' })
                .setDescription(
                    `**اسم الأمر**: \`${prefix}${command.name}\`\n` + 
                    `**الوصف**: ${getArabicDescription(command)}\n` + 
                    `**الفئة**: \`${command.category ? command.category : "General"}\`\n` + 
                    `**اختصارات**: ${aliases}\n` + 
                    `**مدة الانتظار**: \`${command.cooldown ? command.cooldown + ' ثواني' : "لا يوجد"}\``
                );

            return reply({ embeds: [embed] });
        }

        // 2. عرض القائمة الرئيسية (لوحة الأوامر)
        const mainEmbed = new EmbedBuilder()
            .setTitle('✥ لـوحـة الاوامـر')
            .setColor("Random")
            .setThumbnail(HELP_THUMBNAIL)
            .setDescription(`
**لأستعـراض اوامر الكازينـو اخـتر الـزر ادنـاه**
            `);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('show_casino_cmds')
                .setStyle(ButtonStyle.Secondary) // لون رمادي (محايد)
                .setEmoji(HELP_EMOJI)
        );

        const helpMessage = await reply({ embeds: [mainEmbed], components: [row] });

        // 3. كوليكتور للأزرار
        const filter = (i) => i.customId === 'show_casino_cmds';
        const collector = helpMessage.createMessageComponentCollector({ filter, componentType: ComponentType.Button, time: 60000 });

        collector.on('collect', async (i) => {
            // التأكد من أن الشخص الذي ضغط هو نفسه الذي طلب الأمر (اختياري)
            if (i.user.id !== user.id) {
                return i.reply({ content: "🚫 هذا الأمر ليس لك.", ephemeral: true });
            }

            const casinoEmbed = buildCasinoEmbed(client);
            await i.reply({ embeds: [casinoEmbed], ephemeral: true });
        });

        collector.on('end', () => {
            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('show_casino_cmds')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji(HELP_EMOJI)
                    .setDisabled(true)
            );
            
            if (isSlash) {
                interaction.editReply({ components: [disabledRow] }).catch(() => {});
            } else {
                if (helpMessage.editable) helpMessage.edit({ components: [disabledRow] }).catch(() => {});
            }
        });
    }
};
