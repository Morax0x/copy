const { EmbedBuilder, PermissionsBitField, SlashCommandBuilder } = require("discord.js");
const SQLite = require("better-sqlite3");
const sql = new SQLite('./mainDB.sqlite');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mora-admin') // تم تعديل الاسم ليكون بالإنجليزية لضمان عمله كـ Slash Command
        .setDescription('يضيف، يزيل، أو يحدد رصيد المورا لمستخدم معين (حتى للمغادرين).')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        // --- أمر الإضافة ---
        .addSubcommand(subcommand =>
            subcommand
                .setName('اضافة')
                .setDescription('إضافة مورا إلى رصيد مستخدم')
                .addUserOption(option => option.setName('المستخدم').setDescription('المستخدم (منشن أو آيدي)').setRequired(true))
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
                .addUserOption(option => option.setName('المستخدم').setDescription('المستخدم (منشن أو آيدي)').setRequired(true))
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
                .addUserOption(option => option.setName('المستخدم').setDescription('المستخدم (منشن أو آيدي)').setRequired(true))
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
        let method, targetUser, amount, place;

        if (isSlash) {
            interaction = interactionOrMessage;
            member = interaction.member;
            guild = interaction.guild;
            client = interaction.client;

            method = interaction.options.getSubcommand();
            // 🔥 التعديل الأساسي: استخدام getUser بدلاً من getMember لجلب بيانات المغادرين
            targetUser = interaction.options.getUser('المستخدم'); 
            amount = interaction.options.getInteger('المبلغ');
            place = interaction.options.getString('المكان') || 'cash'; 

            if (method === 'اضافة') method = 'add';
            else if (method === 'ازالة') method = 'remove';
            else if (method === 'تحديد') method = 'set';

            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            member = message.member;
            guild = message.guild;
            client = message.client;

            method = args[0] ? args[0].toLowerCase() : null;
            
            // 🔥 التعديل للبريفكس: محاولة جلب المستخدم بالآيدي إذا لم يكن موجوداً كمنشن
            targetUser = message.mentions.users.first();
            if (!targetUser && args[1]) {
                try {
                    targetUser = await client.users.fetch(args[1]);
                } catch (e) {
                    targetUser = null;
                }
            }

            amount = parseInt(args[2]);
            place = 'cash'; 
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

        if (!targetUser || isNaN(amount) || amount < 0 || !['add', 'remove', 'set'].includes(method)) {
            return replyError("البيانات غير صحيحة أو المستخدم غير موجود (تأكد من الآيدي).");
        }

        const getScore = client.getLevel;
        const setScore = client.setLevel;

        // استخدام targetUser.id وهو يعمل سواء كان العضو في السيرفر أم غادره
        let data = getScore.get(targetUser.id, guild.id);

        if (!data) {
            // إذا لم يكن لديه داتا سابقة، ننشئ له داتا جديدة (حتى لو غادر)
            data = { ...client.defaultData, user: targetUser.id, guild: guild.id };
        }

        data.mora = data.mora || 0;
        data.bank = data.bank || 0;

        let actionWord = "";
        
        // --- العمليات الحسابية ---

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
                data.bank = Math.max(0, data.bank - amount);
            } else {
                // سحب من الكاش، وإذا لم يكفِ يسحب من البنك
                if (data.mora >= amount) {
                    data.mora -= amount;
                } else {
                    let remaining = amount - data.mora;
                    data.mora = 0;
                    data.bank = Math.max(0, data.bank - remaining);
                }
            }

        } else if (method === 'set') {
            actionWord = "تحديد"; 
            if (place === 'bank') {
                data.bank = amount;
            } else {
                data.mora = amount;
            }
        }

        setScore.run(data);

        // --- حساب المجموع الكلي للعرض ---
        let totalBalance = data.mora + data.bank;
        
        let statusText = `تـمـت ${actionWord}`;

        const embed = new EmbedBuilder()
            .setColor(0xFFD700) // لون ذهبي
            .setTitle(`✥ تـم تحديـث الرصيـد`)
            .setThumbnail('https://i.postimg.cc/NfH9T3CN/5953886680689347550-120.jpg') 
            .setDescription(`
✶ الاسـم: <@${targetUser.id}>
✶ ${statusText} **${amount.toLocaleString()}** <:mora:1435647151349698621>
✶ الرصيـد الجديـد: **${totalBalance.toLocaleString()}** <:mora:1435647151349698621>`)
            .setFooter({ text: `UserID: ${targetUser.id}` }) // إضافة الآيدي للتوضيح
            .setTimestamp();

        await reply({ embeds: [embed] });
    }
};
