const { SlashCommandBuilder, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, PermissionsBitField, ChannelType, ApplicationCommandOptionType } = require("discord.js");

function cleanRoleIds(input) {
    if (!input) return [];
    return input.split(/[\s,]+/)
        .map(id => id.trim())
        .filter(id => id.length > 0 && !isNaN(id));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('انشاء-رتب')
        .setDescription('انشئ إيمبد رولات.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageRoles)
        .addChannelOption(opt => opt.setName('قناة').setDescription('اختر القناة').setRequired(true).addChannelTypes(ChannelType.GuildText))
        .addStringOption(opt => opt.setName('عنوان').setDescription('عنوان الإيمبد').setRequired(true))
        .addStringOption(opt => opt.setName('الرولات').setDescription('آيديات الرولات (يمكن فصلها بفواصل، فراغات أو أسطر جديدة).').setRequired(true))
        .addStringOption(opt => opt.setName('وصف').setDescription('وصف الإيمبد (اختياري).').setRequired(false))
        .addStringOption(opt => opt.setName('لون_الإيمبد').setDescription('لون الإيمبد كـ هيكس كود (#FF0000).').setRequired(false))
        .addStringOption(opt => opt.setName('صورة_الإيمبد').setDescription('رابط صورة الإيمبد (URL).').setRequired(false))
        .addStringOption(opt => opt.setName('رابط_العنوان').setDescription('رابط عند الضغط على العنوان (URL).').setRequired(false))
        .addStringOption(opt => opt.setName('نص_التذييل').setDescription('النص الذي يظهر أسفل الإيمبد (Footer).').setRequired(false))
        .addStringOption(opt => opt.setName('نسخ_وصف_من_آيدي').setDescription('آيدي رسالة لنسخ محتواها إلى وصف الإيمبد.').setRequired(false)),

    name: 'rr-create', // (اسم احتياطي للبريفكس)
    category: "Admin",

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, member, execChannel;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            member = interaction.member;
            execChannel = interaction.channel;
            await interaction.deferReply({ ephemeral: true });
        } else {
            // (هذا الأمر معقد جداً بالبريفكس، يفضل استخدام السلاش)
            return interactionOrMessage.reply("هذا الأمر متاح كأمر سلاش (/) فقط لضمان الدقة.");
        }

        const sql = client.sql;

        if (!member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            return interaction.editReply({ content: '❌ ليس لديك صلاحية إدارة الأدوار لتنفيذ هذا الأمر.' });
        }

        const channel = interaction.options.getChannel('قناة');
        const title = interaction.options.getString('عنوان');
        const descriptionInput = interaction.options.getString('وصف');
        const rolesInput = interaction.options.getString('الرولات');
        const imageUrl = interaction.options.getString('صورة_الإيمبد');
        const colorInput = interaction.options.getString('لون_الإيمبد');
        const urlInput = interaction.options.getString('رابط_العنوان');
        const footerText = interaction.options.getString('نص_التذييل'); 
        const copyId = interaction.options.getString('نسخ_وصف_من_آيدي');

        let finalDescription = descriptionInput;

        if (copyId) {
            try {
                const msgToCopy = await execChannel.messages.fetch(copyId);
                const copiedContent = msgToCopy.content || msgToCopy.embeds[0]?.description || null;

                if (copiedContent !== null) {
                    finalDescription = copiedContent;
                } else if (descriptionInput === null) {
                    return interaction.editReply({ content: '❌ لم أتمكن من نسخ محتوى من الرسالة المحددة. (قد تكون رسالة فارغة).' });
                }
            } catch {
                return interaction.editReply({ content: '❌ لم أستطع العثور على الرسالة بالـ ID للنسخ.' });
            }
        }

        if (finalDescription === null) {
            finalDescription = '\u200B'; 
        }

        const roleIds = cleanRoleIds(rolesInput);

        if (roleIds.length === 0) {
            return interaction.editReply({ content: '❌ يجب إدخال آيديات رولات صحيحة.' });
        }

        const options = [];
        const rolesToInsert = [];
        const uniqueRoleIds = [...new Set(roleIds)];

        for (const roleId of uniqueRoleIds) {
            const role = interaction.guild.roles.cache.get(roleId);
            if (role) {
                const value = `rr_role_${roleId}`;
                options.push(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(role.name)
                        .setValue(value)
                );
                rolesToInsert.push({ messageId: null, value, roleId: role.id, label: role.name });
            }
        }

        if (options.length === 0) {
            return interaction.editReply({ content: '❌ لم أستطع العثور على أي من الرولات المُدخلة في السيرفر.' });
        }

        const menuCustomId = `rr_${Date.now()}`;
        const embed = new EmbedBuilder().setTitle(title).setDescription(finalDescription);

        if (urlInput) embed.setURL(urlInput);
        if (colorInput) embed.setColor(colorInput);
        else embed.setColor('Blue');

        if (imageUrl) embed.setImage(imageUrl);
        if (footerText) embed.setFooter({ text: footerText });

        const menu = new StringSelectMenuBuilder()
            .setCustomId(menuCustomId)
            .setPlaceholder('اختر رول...')
            .addOptions(options.slice(0, 25))
            .setMinValues(0)
            .setMaxValues(options.length > 25 ? 25 : options.length);

        const row = new ActionRowBuilder().addComponents(menu);

        const sentMessage = await channel.send({ embeds: [embed], components: [row] });

        // 💾 حفظ البيانات في DB
        await sql.prepare("INSERT INTO role_menus_master (message_id, custom_id, is_locked) VALUES (?, ?, ?)")
            .run(sentMessage.id, menuCustomId, 0);

        const stmt = await sql.prepare("INSERT INTO role_menu_items (message_id, value, role_id, description) VALUES (?, ?, ?, ?)");
        for (const item of rolesToInsert) {
            await stmt.run(sentMessage.id, item.value, item.roleId, item.label); 
        }

        return interaction.editReply({ content: `✅ تم إنشاء الإيمبد في ${channel} مع ${options.length} رول. آيدي الرسالة: \`${sentMessage.id}\`` });
    }
};