async function handleShopInteractions(i, client, db) {
    if (i.customId === 'shop_open_menu' || i.customId.startsWith('shop_cat_') || i.customId.startsWith('shop_nav_')) {
        if (!i.deferred && !i.replied) {
            if (i.customId === 'shop_open_menu') {
                await i.deferReply({ flags: MessageFlags.Ephemeral });
            } else {
                await i.deferUpdate();
            }
        }

        const userId = i.user.id;
        const guildId = i.guild.id;

        let userData = await client.getLevel(userId, guildId);
        if (!userData) {
            let dbRes = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [userId, guildId]).catch(()=> db.query(`SELECT * FROM levels WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]})));
            userData = dbRes.rows[0] || { level: 0, mora: 0, bank: 0 };
        }

        let targetCategory = 'general';
        let targetIndex = 0;

        if (i.customId.startsWith('shop_cat_')) {
            targetCategory = i.customId.replace('shop_cat_', '');
        } else if (i.customId.startsWith('shop_nav_')) {
            const parts = i.customId.split('_');
            targetIndex = parseInt(parts[3]);
            targetCategory = parts[4];
        }

        const categoryItems = shopItems.filter(item => item.category === targetCategory);
        
        if (i.customId.startsWith('shop_nav_prev_')) {
            targetIndex = (targetIndex - 1 + categoryItems.length) % categoryItems.length;
        } else if (i.customId.startsWith('shop_nav_next_')) {
            targetIndex = (targetIndex + 1) % categoryItems.length;
        }

        const currentItem = categoryItems[targetIndex];

        let categoryNameAr = 'السوق العام';
        if (targetCategory === 'profession') categoryNameAr = 'المهن والحرف';
        if (targetCategory === 'premium') categoryNameAr = 'الخدمات المميزة';

        let generateShopImage;
        try {
            generateShopImage = require('../../generators/shop-generator.js').generateShopImage;
        } catch (e) {
            try {
                 generateShopImage = require('../generators/shop-generator.js').generateShopImage;
            } catch(e2) {
                 return i.editReply({ content: "❌ لا يمكن العثور على نظام الرسم." });
            }
        }

        const imageBuffer = await generateShopImage(i.user, userData, currentItem, categoryNameAr);

        const navRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`shop_nav_prev_${targetIndex}_${targetCategory}`)
                .setEmoji('⬅️')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`buy_item_${currentItem.id}`)
                .setLabel(`شراء (${currentItem.price})`)
                .setStyle(ButtonStyle.Success)
                .setEmoji('🛒'),
            new ButtonBuilder()
                .setCustomId(`shop_nav_next_${targetIndex}_${targetCategory}`)
                .setEmoji('➡️')
                .setStyle(ButtonStyle.Secondary)
        );

        const categoryRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('shop_cat_general')
                .setLabel('السوق العام')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(targetCategory === 'general'),
            new ButtonBuilder()
                .setCustomId('shop_cat_profession')
                .setLabel('المهن والحرف')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(targetCategory === 'profession'),
            new ButtonBuilder()
                .setCustomId('shop_cat_premium')
                .setLabel('الخدمات المميزة')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(targetCategory === 'premium')
        );

        const replyData = {
            content: `**مرحباً بك في متجر الإمبراطورية** يا <@${userId}>`,
            files: [{ attachment: imageBuffer, name: 'empire_shop.png' }],
            components: [navRow, categoryRow]
        };

        return await i.editReply(replyData);
    }

    if (i.isStringSelectMenu() && i.customId === 'fishing_gear_sub_menu') {
        const val = i.values[0];
        if (val === 'gear_rods') await _handleRodSelect(i, client, db);
        else if (val === 'gear_boats') await _handleBoatSelect(i, client, db);
        else if (val === 'gear_baits') await _handleBaitSelect(i, client, db);
        return;
    }

    if (i.isStringSelectMenu() && i.customId === 'shop_buy_potion_menu') {
        const potionId = i.values[0].replace('buy_item_', '');
        const paginationEmbed = buildPaginatedItemEmbed(potionId);
        if (paginationEmbed) return await i.reply({ ...paginationEmbed, flags: MessageFlags.Ephemeral });
        else return await i.reply({ content: "❌ خطأ في تحميل بيانات الجرعة.", flags: MessageFlags.Ephemeral });
    }

    if (i.customId === 'upgrade_rod') await _handleRodUpgrade(i, client, db);
    else if (i.customId === 'upgrade_boat') await _handleBoatUpgrade(i, client, db);
    else if (i.isStringSelectMenu() && i.customId === 'shop_buy_bait_menu') await _handleBaitBuy(i, client, db);
    else if (i.customId.startsWith('buy_item_')) await _handleShopButton(i, client, db);
    else if (i.customId.startsWith('replace_buff_')) await _handleReplaceBuffButton(i, client, db);
    else if (i.customId === 'cancel_purchase') { await i.deferUpdate(); await i.editReply({ content: 'تم الإلغاء.', components: [], embeds: [] }); }
    else if (i.customId === 'open_xp_modal') { 
        const xpModal = new ModalBuilder().setCustomId('exchange_xp_modal').setTitle('شراء خبرة');
        xpModal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('xp_amount_input').setLabel('الكمية').setStyle(TextInputStyle.Short).setRequired(true)));
        await i.showModal(xpModal);
    }
    else if (i.customId === 'replace_guard') { await _handleReplaceGuard(i, client, db); }
    
    else if (i.customId.startsWith('buy_market_') || i.customId.startsWith('sell_market_') || i.customId.startsWith('buy_animal_') || i.customId.startsWith('sell_animal_')) {
        const action = i.customId.split('_')[0]; 
        const modalId = action === 'buy' ? (i.customId.includes('market') ? 'buy_modal_' : 'buy_animal_') : (i.customId.includes('market') ? 'sell_modal_' : 'sell_animal_');
        const suffix = i.customId.split('_').slice(2).join('_'); 
        const modal = new ModalBuilder().setCustomId(modalId + suffix).setTitle(action === 'buy' ? 'شراء' : 'بيع');
        const input = new TextInputBuilder().setCustomId('quantity_input').setLabel('الكمية').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await i.showModal(modal);
    }
}
