const { SlashCommandBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, PermissionsBitField, ApplicationCommandOptionType } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('تعديل_قائمة')
        .setDescription('إضافة، إزالة، أو تعديل خيار رول في قائمة موجودة.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageRoles)
        .addSubcommand(sub => sub
            .setName('إضافة')
            .setDescription('إضافة خيار رول جديد.')
            .addStringOption(opt => opt.setName('آيدي_الرسالة').setDescription('آيدي رسالة القائمة.').setRequired(true))
            .addRoleOption(opt => opt.setName('الرول_الممنوح').setDescription('الرول الذي سيمنحه الخيار.').setRequired(true))
            .addStringOption(opt => opt.setName('نص_الخيار').setDescription('النص الظاهر في القائمة.').setRequired(true))
            .addStringOption(opt => opt.setName('قيمة_الخيار').setDescription('قيمة فريدة للخيار (مطلوبة داخلياً).').setRequired(true))
            .addStringOption(opt => opt.setName('إيموجي_الخيار').setDescription('إيموجي الخيار (اختياري).').setRequired(false))
            .addStringOption(opt => opt.setName('وصف_الخيار').setDescription('وصف قصير يظهر تحت نص الخيار (اختياري).').setRequired(false))
        )
        .addSubcommand(sub => sub
            .setName('إزالة')
            .setDescription('إزالة خيار رول باستخدام آيدي الرول.')
            .addStringOption(opt => opt.setName('آيدي_الرسالة').setDescription('آيدي رسالة القائمة.').setRequired(true))
            .addRoleOption(opt => opt.setName('آيدي_الرول').setDescription('الرول المراد إزالته من القائمة.').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('تعديل')
            .setDescription('تعديل إيموجي، نص، أو وصف خيار موجود في القائمة.')
            .addStringOption(opt => opt.setName('آيدي_الرسالة').setDescription('آيدي رسالة القائمة.').setRequired(true))
            .addRoleOption(opt => opt.setName('آيدي_الرول').setDescription('الرول المراد تعديله في القائمة.').setRequired(true))
            .addStringOption(opt => opt.setName('إيموجي_جديد').setDescription('الإيموجي الجديد (اختياري).').setRequired(false))
            .addStringOption(opt => opt.setName('نص_جديد').setDescription('النص الجديد الظاهر في القائمة (اختياري).').setRequired(false))
            .addStringOption(opt => opt.setName('وصف_جديد').setDescription('الوصف الجديد للخيار (اختياري).').setRequired(false))
        ),

    name: 'rr-edit-menu', 
    category: "Admin",

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, member; // ( 🌟 'message' هنا سليم )

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            member = interaction.member;
            await interaction.deferReply({ ephemeral: true });
        } else {
             return interactionOrMessage.reply("هذا الأمر متاح كأمر سلاش (/) فقط.");
        }

        const sql = client.sql;

        if (!member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            return interaction.editReply({ content: '❌ ليس لديك صلاحية إدارة الأدوار.' });
        }

        const subcommand = interaction.options.getSubcommand();
        const messageId = interaction.options.getString('آيدي_الرسالة');

        const menuMaster = await sql.prepare("SELECT custom_id, is_locked FROM role_menus_master WHERE message_id = ?").get(messageId);
        if (!menuMaster) return interaction.editReply({ content: '❌ هذا ليس آيدي رسالة قائمة أدوار مسجلة.' });

        // --- ( 🌟 تم الإصلاح هنا 🌟 ) ---
        // (تم تغيير 'message' إلى 'messageToEdit' لتجنب التعارض)
        const messageToEdit = await interaction.channel.messages.fetch(messageId).catch(() => null); 
        if (!messageToEdit || !messageToEdit.components[0] || messageToEdit.components[0].components[0].type !== 3)
            return interaction.editReply({ content: '❌ الرسالة لا تحتوي على قائمة اختيار.' });

        const currentMenu = StringSelectMenuBuilder.from(messageToEdit.components[0].components[0]);
        // --- ( 🌟 نهاية الإصلاح 🌟 ) ---

        const menuMessageId = messageId;
        let replyMessage = '';
        let menuUpdated = false;

        if (subcommand === 'إضافة') {
            const role = interaction.options.getRole('الرول_الممنوح');
            const label = interaction.options.getString('نص_الخيار');
            const value = interaction.options.getString('قيمة_الخيار');
            const emojiStr = interaction.options.getString('إيموجي_الخيار');
            const descriptionStr = interaction.options.getString('وصف_الخيار'); 

            if (currentMenu.options.some(opt => opt.data.value === value)) {
                return interaction.editReply({ content: `❌ قيمة الخيار (\`${value}\`) مستخدمة بالفعل في هذه القائمة.` });
            }
            if (currentMenu.options.length >= 25) {
                return interaction.editReply({ content: '❌ قائمة الاختيار وصلت إلى الحد الأقصى (25 خيارًا).' });
            }

            currentMenu.options = currentMenu.options.filter(opt => opt.data.value !== 'placeholder_value_initial');

            const newOption = new StringSelectMenuOptionBuilder()
                .setLabel(label)
                .setValue(value)
                .setEmoji(emojiStr || null)
                .setDescription(descriptionStr || null);

            currentMenu.addOptions(newOption);

            const maxOptions = currentMenu.options.length > 0 ? currentMenu.options.length : 1;
            currentMenu.setMaxValues(maxOptions);

            menuUpdated = true;

            await sql.prepare(`INSERT INTO role_menu_items (message_id, value, role_id, description, emoji) VALUES (?, ?, ?, ?, ?)`).run(menuMessageId, value, role.id, descriptionStr, emojiStr); 

            replyMessage = `✅ تم إضافة الرول ${role.name} بنجاح إلى القائمة.`;

        } else if (subcommand === 'إزالة') {
            const roleToRemove = interaction.options.getRole('آيدي_الرول');
            const roleIdToRemove = roleToRemove.id;

            const itemEntry = await sql.prepare("SELECT value FROM role_menu_items WHERE message_id = ? AND role_id = ?").get(menuMessageId, roleIdToRemove);
            if (!itemEntry) {
                return interaction.editReply({ content: `❌ الرول ${roleToRemove.name} ليس موجوداً في قائمة هذه الرسالة.` });
            }
            const valueToRemove = itemEntry.value;

            const initialLength = currentMenu.options.length;
            currentMenu.options = currentMenu.options.filter(opt => opt.data.value !== valueToRemove);

            if (currentMenu.options.length === initialLength) {
                return interaction.editReply({ content: `❌ فشل في إزالة الخيار المرتبط بالرول ${roleToRemove.name}.` });
            }

            const maxOptions = currentMenu.options.length > 0 ? currentMenu.options.length : 1;
            currentMenu.setMaxValues(maxOptions);
            menuUpdated = true;

            await sql.prepare("DELETE FROM role_menu_items WHERE message_id = ? AND value = ?").run(menuMessageId, valueToRemove);

            replyMessage = `✅ تم إزالة الرول ${roleToRemove.name} بنجاح من القائمة.`;

        } else if (subcommand === 'تعديل') {
            const roleToEdit = interaction.options.getRole('آيدي_الرول');
            const roleIdToEdit = roleToEdit.id;

            const itemEntry = await sql.prepare("SELECT value, description, emoji FROM role_menu_items WHERE message_id = ? AND role_id = ?").get(menuMessageId, roleIdToEdit);
            if (!itemEntry) {
                return interaction.editReply({ content: `❌ الرول ${roleToEdit.name} ليس موجوداً في قائمة هذه الرسالة لتعديله.` });
            }
            const valueToEdit = itemEntry.value;
            const newEmoji = interaction.options.getString('إيموجي_جديد');
            const newLabel = interaction.options.getString('نص_جديد');
            const newDescription = interaction.options.getString('وصف_جديد');

            const optionIndex = currentMenu.options.findIndex(opt => opt.data.value === valueToEdit);

            const oldOption = currentMenu.options[optionIndex];
            let dbUpdated = false;

            let updatedEmoji = newEmoji !== null ? newEmoji : itemEntry.emoji;
            let updatedLabel = newLabel !== null ? newLabel : oldOption.data.label;
            let updatedDescription = newDescription !== null ? newDescription : itemEntry.description;

            if (newEmoji !== null) {
                await sql.prepare("UPDATE role_menu_items SET emoji = ? WHERE message_id = ? AND value = ?").run(newEmoji, menuMessageId, valueToEdit);
                dbUpdated = true;
            }

            if (newLabel !== null) {
                dbUpdated = true;
            }

            if (newDescription !== null) { 
                await sql.prepare("UPDATE role_menu_items SET description = ? WHERE message_id = ? AND value = ?").run(newDescription, menuMessageId, valueToEdit);
                dbUpdated = true;
            }

            if (!dbUpdated) {
                return interaction.editReply({ content: 'ℹ️ لم يتم تحديد إيموجي، نص، أو وصف جديد للتعديل.' });
            }

            const updatedOption = new StringSelectMenuOptionBuilder()
                .setLabel(updatedLabel)
                .setValue(valueToEdit)
                .setEmoji(updatedEmoji || null) 
                .setDescription(updatedDescription || null);

            currentMenu.options[optionIndex] = updatedOption;
            menuUpdated = true;
            replyMessage = `✅ تم تحديث الرول ${roleToEdit.name} بنجاح.`;
        }

        if (menuUpdated) {
            const actionRow = new ActionRowBuilder().addComponents(currentMenu);
            // --- ( 🌟 تم الإصلاح هنا 🌟 ) ---
            await messageToEdit.edit({ components: [actionRow] }); 
        }

        return interaction.editReply({ content: replyMessage });
    }
};