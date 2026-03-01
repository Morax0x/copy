const { SlashCommandBuilder } = require("discord.js");
// const SQLite = require("better-sqlite3"); // ( 1 ) تم الحذف
// const sql = new SQLite('./mainDB.sqlite') // ( 2 ) تم الحذف
const canvacord = require("canvacord");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('تخصيص-الرانك')
        .setDescription('تخصيص ألوان بطاقة الرانك (اللفل) الخاصة بك.')
        .addSubcommand(sub => sub
            .setName('شريط-التقدم')
            .setDescription('تغيير لون شريط التقدم (البروجرس بار).')
            .addStringOption(opt => opt.setName('اللون').setDescription('اللون (اسم أو كود HEX مثل #FF0000)').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('النص')
            .setDescription('تغيير لون النص (الاسم، اللفل، XP).')
            .addStringOption(opt => opt.setName('اللون').setDescription('اللون (اسم أو كود HEX)').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('الخلفية')
            .setDescription('تغيير لون الخلفية للبطاقة.')
            .addStringOption(opt => opt.setName('اللون').setDescription('اللون (اسم أو كود HEX)').setRequired(true))
        ),

    name: 'custom-rank',
    aliases: ['customrank', 'rankcard'],
    description: "Customize rank card color such as; Progress, Background and Text.",
    cooldown: 3,
    category: "Leveling",
    async execute (interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, user;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            user = interaction.user;
            await interaction.deferReply({ ephemeral: true });
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            user = message.author;
        }

        // --- ( 🌟 تم التصحيح هنا 🌟 ) ---
        const sql = client.sql;

        const reply = async (content) => {
            const payload = { content, ephemeral: true };
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };

        // --- توحيد المدخلات ---
        let method, color;

        if (isSlash) {
            const subcommand = interaction.options.getSubcommand();
            color = interaction.options.getString('اللون');

            if (subcommand === 'شريط-التقدم') method = 'progressbar';
            else if (subcommand === 'النص') method = 'text';
            else if (subcommand === 'الخلفية') method = 'background';
        } else {
            method = args[0];
            color = args[1];
        }

        // --- المنطق الأساسي ---
        if (!method) {
            const currentPrefixResult = sql.prepare("SELECT serverprefix FROM prefix WHERE guild = ?").get(guild.id);
            const currentPrefix = currentPrefixResult ? currentPrefixResult.serverprefix.toString() : "-";

            const usageMessage = "Invalid Usage! \n" +
                `**Usage:** \`${currentPrefix}rankcard <progressbar / bar> <color>\`\n` +
                `\`${currentPrefix}rankcard <text> <color>\`\n` +
                `\`${currentPrefix}rankcard <background> <color>\``;

            if (isSlash) return reply(usageMessage); // هذا لن يحدث في السلاش لكنه احتياط
            return message.channel.send(usageMessage); // الرد الأصلي لم يكن ريبلاي
        }

        const methodLower = method.toLowerCase();
        let updateField = null;

        if (methodLower === "progressbar" || methodLower === "bar" || methodLower === "progressbarcolor") {
            updateField = "barColor";
        } else if (methodLower === "text" || methodLower === "textcolor") {
            updateField = "textColor";
        } else if (methodLower === "background" || methodLower === "backgroundcolor") {
            updateField = "backgroundColor";
        } else {
            const currentPrefixResult = sql.prepare("SELECT serverprefix FROM prefix WHERE guild = ?").get(guild.id);
            const currentPrefix = currentPrefixResult ? currentPrefixResult.serverprefix.toString() : "-";
            return reply(`Invalid Method! \n**Usage:** \`${currentPrefix}rankcard <progressbar | text | background> <color>\``);
        }

        if (!color) {
            return reply("Please provide a valid color!");
        }

        const userId = `${user.id}-${guild.id}`;

        // --- ( 🌟 تحسين الكود 🌟 ) ---
        // التأكد من وجود سطر للمستخدم قبل التحديث
        const rankCardData = sql.prepare("SELECT id FROM rankCardTable WHERE id = ?").get(userId);
        if (!rankCardData) {
            sql.prepare("INSERT INTO rankCardTable (id, barColor, textColor, backgroundColor) VALUES (?, '#FFFFFF', '#FFFFFF', '#23272A')")
               .run(userId);
        }

        // تنفيذ التحديث
        sql.prepare(`UPDATE rankCardTable SET ${updateField} = ? WHERE id = ?;`).run(color, userId);

        return reply("Successfully updated color.");
    }
}