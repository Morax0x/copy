const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, PermissionsBitField, ChannelType, ApplicationCommandOptionType } = require("discord.js");
const axios = require('axios'); 
// ( 🌟 تمت إضافة هذا السطر المهم 🌟 )
const { loadRoleSettings } = require("../../handlers/reaction-role-handler.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ادوات-الرتب')
        .setDescription('أدوات إضافية لإدارة قوائم الرتب.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageRoles)
        .addSubcommand(sub => sub
            .setName('قفل-القائمة')
            .setDescription('يمنع العضو من تغيير اختياره بمجرد أخذ رول من القائمة.')
            .addStringOption(opt => opt.setName('آيدي_الرسالة').setDescription('آيدي رسالة القائمة المراد قفلها.').setRequired(true))
            .addBooleanOption(opt => opt.setName('حالة_القفل').setDescription('هل تريد قفل القائمة (True) أم فتحها (False)؟').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('تسجيل-قائمة')
            .setDescription('يجعل البوت يتذكر قائمة أدوار موجودة لتعديلها.')
            .addStringOption(opt => opt.setName('آيدي_الرسالة').setDescription('آيدي رسالة قائمة الأدوار الموجودة.').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('استيراد-اعدادات')
            .setDescription('يستورد إعدادات الرولات المضادة من ملف JSON مُرفق.')
            .addAttachmentOption(opt => opt.setName('ملف_الإعدادات').setDescription('ملف JSON الذي يحتوي على إعدادات الرولات.').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('نسخ-إيمبد')
            .setDescription('ينسخ إيمبد قائمة الأدوار إلى قناة جديدة.')
            .addStringOption(opt => opt.setName('آيدي_الرسالة_الأصلية').setDescription('آيدي رسالة الإيمبد المراد نسخها.').setRequired(true))
            .addChannelOption(opt => opt.setName('القناة_الجديدة').setDescription('القناة التي سيتم إرسال النسخة إليها.').setRequired(true).addChannelTypes(ChannelType.GuildText))
        ),
        
    name: 'rr-other', 
    category: "Admin",
    
    async execute(interactionOrMessage, args) {
        
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, member;

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
        
        if (subcommand === 'قفل-القائمة') {
            const messageId = interaction.options.getString('آيدي_الرسالة');
            const shouldLock = interaction.options.getBoolean('حالة_القفل');
            const isLockedInt = shouldLock ? 1 : 0;

            const result = await sql.prepare("UPDATE role_menus_master SET is_locked = ? WHERE message_id = ?").run(isLockedInt, messageId);

            if (result.changes === 0) {
                return interaction.editReply({ content: '❌ هذا ليس آيدي رسالة قائمة أدوار مسجلة.' });
            }
            
            const status = shouldLock ? 'مغلقة' : 'مفتوحة';
            return interaction.editReply({ content: `✅ تم تحديث حالة القائمة (آيدي: \`${messageId}\`) إلى: **${status}**.` });
        
        } else if (subcommand === 'تسجيل-قائمة') {
            const messageId = interaction.options.getString('آيدي_الرسالة');

            const message = await interaction.channel.messages.fetch(messageId).catch(() => null);
            if (!message) {
                return interaction.editReply({ content: '❌ لم أستطع العثور على الرسالة بهذا الآيدي.' });
            }

            const selectMenu = message.components[0]?.components[0];
            if (!selectMenu || selectMenu.type !== 3) {
                return interaction.editReply({ content: '❌ الرسالة لا تحتوي على قائمة اختيار (Select Menu).' });
            }
            
            const existingEntry = await sql.prepare("SELECT message_id FROM role_menus_master WHERE message_id = ?").get(messageId);
            if (existingEntry) {
                return interaction.editReply({ content: 'ℹ️ هذه القائمة مسجلة بالفعل في قاعدة بيانات البوت.' });
            }

            const menuCustomId = selectMenu.customId || `rr_manual_${Date.now()}`;
            
            await sql.prepare("INSERT INTO role_menus_master (message_id, custom_id, is_locked) VALUES (?, ?, ?)")
                .run(messageId, menuCustomId, 0);

            const optionsToInsert = [];
            let optionsCount = 0;

            for (const option of selectMenu.options) {
                let roleId = null; 
                
                const roleIdMatch = option.value.match(/(\d{17,19})/); 
                if (roleIdMatch) {
                    roleId = roleIdMatch[0];
                } else if (option.value && option.value.length >= 17 && !isNaN(option.value)) {
                    roleId = option.value;
                }

                if (roleId && interaction.guild.roles.cache.has(roleId)) { 
                    optionsToInsert.push([
                        messageId, 
                        option.value, 
                        roleId, 
                        option.description || null, 
                        option.emoji ? option.emoji.name : null
                    ]);
                    optionsCount++;
                }
            }
            
            if (optionsToInsert.length > 0) {
                const stmt = await sql.prepare("INSERT INTO role_menu_items (message_id, value, role_id, description, emoji) VALUES (?, ?, ?, ?, ?)");
                const transaction = sql.transaction(() => {
                    for (const item of optionsToInsert) {
                        stmt.run(...item);
                    }
                });
                transaction();
            }
            
            if (!selectMenu.customId) {
                const newMenu = StringSelectMenuBuilder.from(selectMenu).setCustomId(menuCustomId);
                const newRow = new ActionRowBuilder().addComponents(newMenu);
                await message.edit({ components: [newRow] });
            }

            return interaction.editReply({ 
                content: `✅ تم تسجيل القائمة بنجاح. يمكنك الآن تعديلها باستخدام الأوامر الأخرى.\n(تم تسجيل ${optionsCount} رول).`
            });

        } else if (subcommand === 'استيراد-اعدادات') {
            const attachment = interaction.options.getAttachment('ملف_الإعدادات');

            if (!attachment.contentType || !attachment.contentType.includes('application/json')) {
                return interaction.editReply({ content: '❌ يجب أن يكون الملف المرفق من نوع JSON (تأكد من اختيار امتداد .json).' });
            }

            try {
                const response = await axios.get(attachment.url);
                const settingsArray = response.data;

                if (!Array.isArray(settingsArray)) {
                    return interaction.editReply({ content: '❌ محتوى الملف غير صالح. يجب أن يكون مصفوفة (Array) من الإعدادات.' });
                }

                const validRoles = [];
                for (const item of settingsArray) {
                    if (item.role_id && Array.isArray(item.anti_roles) && typeof item.is_removable === 'boolean') {
                        if (interaction.guild.roles.cache.has(item.role_id)) {
                            validRoles.push({
                                role_id: item.role_id,
                                anti_roles: item.anti_roles
                                    .filter(id => interaction.guild.roles.cache.has(id))
                                    .join(','), 
                                is_removable: item.is_removable ? 1 : 0
                            });
                        }
                    }
                }
                
                if (validRoles.length === 0) {
                    return interaction.editReply({ content: '❌ لم يتم العثور على أي إعدادات صالحة أو مطابقة لرولات موجودة في السيرفر داخل الملف.' });
                }

                await sql.prepare("DELETE FROM role_settings").run();
                
                const stmt = await sql.prepare("INSERT INTO role_settings (role_id, anti_roles, is_removable) VALUES (?, ?, ?)");
                const transaction = sql.transaction(() => {
                    for (const role of validRoles) {
                        stmt.run(role.role_id, role.anti_roles, role.is_removable);
                    }
                });
                transaction();

                // ( 🌟 الآن سيعمل هذا السطر بنجاح 🌟 )
                await loadRoleSettings(sql, client.antiRolesCache);

                return interaction.editReply({ 
                    content: `✅ تم استيراد وتحديث **${validRoles.length}** إعداد رول بنجاح.`
                });

            } catch (error) {
                console.error('Import settings error:', error);
                return interaction.editReply({ 
                    content: `❌ حدث خطأ أثناء قراءة أو معالجة الملف. تأكد من أن الملف بصيغة JSON صحيحة.`
                });
            }
        
        } else if (subcommand === 'نسخ-إيمبد') {
            const originalMessageId = interaction.options.getString('آيدي_الرسالة_الأصلية');
            const newChannel = interaction.options.getChannel('القناة_الجديدة');

            if (newChannel.type !== ChannelType.GuildText) {
                return interaction.editReply({ content: '❌ يجب أن تكون القناة الجديدة قناة نصية.' });
            }

            const originalMessage = await interaction.channel.messages.fetch(originalMessageId).catch(() => null);
            if (!originalMessage || originalMessage.embeds.length === 0) {
                return interaction.editReply({ content: '❌ لم يتم العثور على الرسالة الأصلية أو أنها لا تحتوي على إيمبد.' });
            }

            const masterEntry = await sql.prepare("SELECT custom_id, is_locked FROM role_menus_master WHERE message_id = ?").get(originalMessageId);
            if (!masterEntry) {
                return interaction.editReply({ content: '❌ الرسالة الأصلية ليست قائمة أدوار مسجلة.' });
            }

            const originalMenu = originalMessage.components[0]?.components[0];
            if (!originalMenu || originalMenu.type !== 3) {
                return interaction.editReply({ content: '❌ الرسالة الأصلية لا تحتوي على قائمة اختيار.' });
            }

            const newCustomId = `rr_${Date.now()}_copy`;
            const newMenu = StringSelectMenuBuilder.from(originalMenu).setCustomId(newCustomId);
            const newRow = new ActionRowBuilder().addComponents(newMenu);

            const sentMessage = await newChannel.send({ 
                embeds: originalMessage.embeds, 
                components: [newRow] 
            });

            await sql.prepare("INSERT INTO role_menus_master (message_id, custom_id, is_locked) VALUES (?, ?, ?)")
                .run(sentMessage.id, newCustomId, masterEntry.is_locked);

            const items = await sql.prepare("SELECT value, role_id, description, emoji FROM role_menu_items WHERE message_id = ?").all(originalMessageId);
            
            const stmt = await sql.prepare("INSERT INTO role_menu_items (message_id, value, role_id, description, emoji) VALUES (?, ?, ?, ?, ?)");
            const transaction = sql.transaction(() => {
                for (const item of items) {
                    stmt.run(sentMessage.id, item.value, item.role_id, item.description, item.emoji);
                }
            });
            transaction();
            
            return interaction.editReply({ content: `✅ تم نسخ الإيمبد بنجاح إلى ${newChannel}. آيدي الرسالة الجديدة: \`${sentMessage.id}\`` });
        }
    }
};
