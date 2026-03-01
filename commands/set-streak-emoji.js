const { PermissionsBitField, SlashCommandBuilder } = require("discord.js");
// ( 1 ) تم حذف السطرين الخاصين بـ new SQLite

module.exports = {
    // --- ( 2 ) إضافة بيانات أمر السلاش ---
    data: new SlashCommandBuilder()
        .setName('تغيير-ايموجي-الستريك')
        .setDescription('يغير الإيموجي المستخدم في ستريك اللقب.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addStringOption(option =>
            option.setName('الايموجي')
            .setDescription('الإيموجي الجديد الذي سيظهر بجانب الستريك')
            .setRequired(true)),
    // ---------------------------------

    name: 'set-streak-emoji',
    aliases: ['setstreakemoji'],
    category: "Admin", // ( 3 ) تم التغيير إلى فئة الادمن
    description: "يغير الإيموجي المستخدم في ستريك اللقب.",

    async execute(interactionOrMessage, args) {

        // --- ( 4 ) إضافة معالج الأوامر الهجينة ---
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, member;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            member = interaction.member;
            await interaction.deferReply({ ephemeral: true });
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            member = message.member;
        }

        // --- ( 5 ) إصلاح اتصال قاعدة البيانات ---
        const sql = client.sql;

        // --- ( 6 ) توحيد دوال الرد ---
        const reply = async (payload) => {
            if (typeof payload === 'string') payload = { content: payload };
            payload.ephemeral = false; // جعل الرد عام
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };
        const replyError = async (content) => {
            const payload = { content, ephemeral: true };
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };
        // ------------------------------------

        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return replyError(`ليس لديك صلاحية الإدارة!`);
        }

        // --- ( 7 ) توحيد جلب المدخلات ---
        let emoji;
        if (isSlash) {
            emoji = interaction.options.getString('الايموجي');
        } else {
            emoji = args[0];
        }
        // ------------------------------------

        if (!emoji) {
            return replyError("الاستخدام: `/تغيير-ايموجي-الستريك <الإيموجي>` (مثال: `/تغيير-ايموجي-الستريك ✨`)");
        }

        const getSettings = sql.prepare("SELECT * FROM settings WHERE guild = ?");
        let settings = getSettings.get(guild.id);

        if (!settings) {
            sql.prepare("INSERT INTO settings (guild, streakEmoji) VALUES (?, ?)").run(guild.id, emoji);
        } else {
            sql.prepare("UPDATE settings SET streakEmoji = ? WHERE guild = ?").run(emoji, guild.id);
        }

        return reply(`تم تغيير إيموجي الستريك بنجاح إلى ${emoji}.`);
    }
};