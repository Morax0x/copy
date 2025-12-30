const { EmbedBuilder, PermissionsBitField, SlashCommandBuilder } = require("discord.js");
const SQLite = require("better-sqlite3");
const sql = new SQLite('./mainDB.sqlite');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('موراا')
        .setDescription('يضيف، يزيل، أو يحدد رصيد المورا لمستخدم معين.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        // --- أمر الإضافة ---
        .addSubcommand(subcommand =>
            subcommand
                .setName('اضافة')
                .setDescription('إضافة مورا إلى رصيد مستخدم')
                .addUserOption(option => option.setName('المستخدم').setDescription('المستخدم الذي تريد إضافة الرصيد له').setRequired(true))
                .addIntegerOption(option => option.setName('المبلغ').setDescription('المبلغ الذي تريد إضافته').setRequired(true).setMinValue(1))
                .addStringOption(option => 
                    option.setName('المكان')
                        .setDescription('أين تريد إضافة المبلغ؟ (الافتراضي: كاش)')
                        .addChoices(
                            { name: 'كاش 💵', value: 'cash' },
                            { name: 'بنك 🏦', value: 'bank' }
                        )
                )
        )
        // --- أمر الإزالة ---
        .addSubcommand(subcommand =>
            subcommand
                .setName('ازالة')
                .setDescription('إزالة مورا من رصيد مستخدم')
                .addUserOption(option => option.setName('المستخدم').setDescription('المستخدم الذي تريد إزالة الرصيد منه').setRequired(true))
                .addIntegerOption(option => option.setName('المبلغ').setDescription('المبلغ الذي تريد إزالته').setRequired(true).setMinValue(1))
                .addStringOption(option => 
                    option.setName('المكان')
                        .setDescription('من أين تريد إزالة المبلغ؟ (الافتراضي: كاش ثم بنك)')
                        .addChoices(
                            { name: 'كاش 💵', value: 'cash' },
                            { name: 'بنك 🏦', value: 'bank' }
                        )
                )
        )
        // --- أمر التحديد ---
        .addSubcommand(subcommand =>
            subcommand
                .setName('تحديد')
                .setDescription('تحديد رصيد المورا لمستخدم')
                .addUserOption(option => option.setName('المستخدم').setDescription('المستخدم الذي تريد تحديد رصيده').setRequired(true))
                .addIntegerOption(option => option.setName('المبلغ').setDescription('الرصيد الجديد').setRequired(true).setMinValue(0))
                .addStringOption(option => 
                    option.setName('المكان')
                        .setDescription('أي رصيد تريد تحديده؟ (الافتراضي: كاش)')
                        .addChoices(
                            { name: 'كاش 💵', value: 'cash' },
                            { name: 'بنك 🏦', value: 'bank' }
                        )
                )
        ),

    name: 'mora-admin',
    aliases: ['gm', 'set-mora'],
    category: "Economy",
    description: "يضيف، يزيل، أو يحدد رصيد المورا لمستخدم معين.",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, member, guild, client;
        let method, targetMember, amount, place;

        if (isSlash) {
            interaction = interactionOrMessage;
            member = interaction.member;
            guild = interaction.guild;
            client = interaction.client;

            method = interaction.options.getSubcommand();
            targetMember = interaction.options.getMember('المستخدم');
            amount = interaction.options.getInteger('المبلغ');
            place = interaction.options.getString('المكان') || 'cash'; // الافتراضي كاش

            // توحيد المسميات للكود
            if (method === 'اضافة') method = 'add';
            else if (method === 'ازالة') method = 'remove';
            else if (method === 'تحديد') method = 'set';

            await interaction.deferReply();
        } else {
            // دعم الأوامر العادية (Prefix) بشكل بسيط
            message = interactionOrMessage;
            member = message.member;
            guild = message.guild;
            client = message.client;

            method = args[0] ? args[0].toLowerCase() : null;
            targetMember = message.mentions.members.first() || message.guild.members.cache.get(args[1]);
            amount = parseInt(args[2]);
            place = 'cash'; // في البريفكس نفترض دائماً كاش للتبسيط
        }

        const reply = async (payload) => {
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };

        const replyError = async (content) => {
            const payload = { content, ephemeral: true };
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };

        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return replyError(`⛔️ يجب أن تكون لديك صلاحية **Administrator** لاستخدام هذا الأمر!`);
        }

        if (!targetMember || isNaN(amount) || amount < 0 || !['add', 'remove', 'set'].includes(method)) {
            return replyError("البيانات غير صحيحة.");
        }

        const getScore = client.getLevel;
        const setScore = client.setLevel;

        let data = getScore.get(targetMember.id, guild.id);

        if (!data) {
            data = { ...client.defaultData, user: targetMember.id, guild: guild.id };
        }

        // التأكد من وجود القيم
        data.mora = data.mora || 0;
        data.bank = data.bank || 0;

        let actionWord = "";
        
        // --- المنطق البرمجي ---

        if (method === 'add') {
            actionWord = "اضـافـة";
            if (place === 'bank') {
                data.bank += amount;
            } else {
                data.mora += amount;
            }

        } else if (method === 'remove') {
            actionWord = "ازالـة";
            
            if (place === 'bank') {
                // إذا حدد البنك، نسحب من البنك فقط
                data.bank = Math.max(0, data.bank - amount);
            } else {
                // إذا كاش (الافتراضي)، نسحب من الكاش، وإذا نقص نسحب من البنك
                if (data.mora >= amount) {
                    data.mora -= amount;
                } else {
                    // الكاش ما يكفي، ناخذ كل الكاش ونكمل من البنك
                    let remaining = amount - data.mora;
                    data.mora = 0;
                    data.bank = Math.max(0, data.bank - remaining);
                }
            }

        } else if (method === 'set') {
            actionWord = "تحديد"; // أو تغيير، لكن سنستخدم الصيغة للتوافق
            if (place === 'bank') {
                data.bank = amount;
            } else {
                data.mora = amount;
            }
        }

        // حفظ البيانات
        setScore.run(data);

        // تجهيز القيم للعرض
        // نعرض الرصيد الذي تم التأثير عليه (أو المجموع حسب رغبتك، هنا سأعرض رصيد الكاش الحالي للتوافق مع الرسالة المطلوبة)
        // لكن بما أن الطلب "الرصيد الجديد"، الأفضل نعرض المكان اللي تعدل
        let finalDisplayAmount = (place === 'bank') ? data.bank : data.mora; 
        
        // النص: "تمت اضافة" أو "تمت ازالة"
        let statusText = `تـمـت ${actionWord}`;

        const embed = new EmbedBuilder()
            .setColor(0xFFD700) // لون ذهبي
            .setTitle(`✥ تـم تحديـث الرصيـد`)
            .setThumbnail('https://i.postimg.cc/NfH9T3CN/5953886680689347550-120.jpg') // الصورة المطلوبة
            .setDescription(`
✶ الاسـم: <@${targetMember.id}>
✶ ${statusText} **${amount.toLocaleString()}** <:mora:1435647151349698621>
✶ الرصيـد الجديـد: **${finalDisplayAmount.toLocaleString()}** <:mora:1435647151349698621>`)
            // يمكنك إزالة الفوتر والوقت إذا أردت تطابق تام مع "نص" فقط، لكن سأبقيهم للمنظر العام
            .setTimestamp();

        await reply({ embeds: [embed] });
    }
};
