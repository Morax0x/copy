const { 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle 
} = require('discord.js');

const { 
    skillsConfig, 
    ownerSkills, 
    OWNER_ID 
} = require('../constants');

const { handleSkillUsage } = require('../skills');
const { generateBattleEmbed } = require('../ui');
const { sendEndMessage } = require('../core/end-game');
const { getRealPlayerData } = require('../utils'); 
const { cleanName } = require('../core/battle-utils'); 

/**
 * دالة معالجة قائمة الإمبراطور (الأونر)
 * تقوم بعرض القوائم، تنفيذ المهارات، ومعالجة بوابة الأبعاد وشق الزمكان
 */
async function handleOwnerMenu(i, players, monster, log, threadChannel, sql, guild, hostId, activeDungeonRequests, merchantState, battleMsg, turnTimeout, mainCollector, ongoingRef) {
    
    // 1. إنشاء القائمة الرئيسية
    const menu = new StringSelectMenuBuilder()
        .setCustomId('owner_god_menu_category')
        .setPlaceholder('👑 اختر قسم القوة المطلقة')
        .addOptions([
            { label: 'الإمبراطـور', description: 'مهارات الوجود والعدم', value: 'cat_emperor', emoji: '👑' },
            { label: 'الأعـراق', description: 'جميع مهارات الأعراق', value: 'cat_races', emoji: '🧬' },
            { label: 'التصنيفـات', description: 'مهارات الكلاسات الخاصة', value: 'cat_classes', emoji: '⚔️' },
            { label: 'مهـارات عامة', description: 'المهارات الأساسية بقوة مضاعفة', value: 'cat_skills', emoji: '📜' },
        ]);
    
    const ownerMenuMsg = await i.reply({ 
        content: `**👑 مرحباً مولاي الإمبراطور..**\nاختر التصنيف لاستدعاء القوة:`, 
        components: [new ActionRowBuilder().addComponents(menu)], 
        ephemeral: true,
        fetchReply: true 
    });

    // كوليكتور خاص بالقائمة المؤقتة (لمدة دقيقة)
    const menuCollector = ownerMenuMsg.createMessageComponentCollector({ 
        filter: subI => subI.user.id === i.user.id, 
        time: 60000 
    });

    menuCollector.on('collect', async subI => {
        // 🛠️ معالجة اختيار التصنيف (Category Selection)
        if (subI.customId === 'owner_god_menu_category') {
            const category = subI.values[0];
            let options = [];

            if (category === 'cat_emperor') {
                options = ownerSkills.map(s => ({
                    label: s.name, description: s.description.substring(0, 100), value: s.id, emoji: s.emoji
                }));
            } else if (category === 'cat_races') {
                options = skillsConfig.filter(s => s.id.startsWith('race_')).map(s => ({
                    label: s.name, description: `(x10 DMG) ${s.description}`.substring(0, 100), value: s.id, emoji: s.emoji
                }));
            } else if (category === 'cat_classes') {
                options = [
                    { label: 'صرخة الحرب', description: 'بفات للفريق', value: 'class_Leader', emoji: '⚔️' },
                    { label: 'استفزاز', description: 'سحب الضرر ودفاع', value: 'class_Tank', emoji: '🛡️' },
                    { label: 'النور المقدس', description: 'إحياء وعلاج', value: 'class_Priest', emoji: '✨' },
                    { label: 'سجن الجليد', description: 'تجميد الوحش', value: 'class_Mage', emoji: '❄️' },
                    { label: 'حارس الظل', description: 'استدعاء وحش', value: 'class_Summoner', emoji: '🐺' }
                ];
            } else if (category === 'cat_skills') {
                options = skillsConfig.filter(s => !s.id.startsWith('race_') && s.stat_type !== 'Owner').map(s => ({
                    label: s.name, description: `(x10 Effect) ${s.description}`.substring(0, 100), value: s.id, emoji: s.emoji
                }));
            }

            if (options.length === 0) return subI.reply({ content: "لا توجد مهارات هنا.", ephemeral: true });

            const skillMenu = new StringSelectMenuBuilder()
                .setCustomId('owner_god_menu_execute')
                .setPlaceholder('⚡ اختر المهارة للتنفيذ فوراً')
                .addOptions(options.slice(0, 25));

            await subI.update({ 
                content: `**👑 تصنيف: ${category.replace('cat_', '').toUpperCase()}**\nاختر المهارة لإطلاقها:`, 
                components: [new ActionRowBuilder().addComponents(skillMenu)] 
            });
        }

        // 🛠️ معالجة تنفيذ المهارة (Skill Execution)
        if (subI.customId === 'owner_god_menu_execute') {
            const skillID = subI.values[0];
            
            // البحث عن المهارة في القائمتين
            let skillObj = skillsConfig.find(s => s.id === skillID) || ownerSkills.find(s => s.id === skillID);

            if (!skillObj && skillID.startsWith('class_')) {
                skillObj = { id: skillID, name: skillID, base_price: 0 };
            }
            
            let p = players.find(pl => pl.id === subI.user.id);
            
            // إضافة الأونر للقائمة إذا لم يكن موجوداً (Dungeon Entry via Cheat)
            if (!p && subI.user.id === OWNER_ID) {
                 const member = await subI.guild.members.fetch(OWNER_ID).catch(() => null);
                 if(member) {
                     const ownerPlayer = getRealPlayerData(member, sql, '???');
                     ownerPlayer.name = cleanName(ownerPlayer.name);
                     players.push(ownerPlayer);
                     p = ownerPlayer;
                     log.push(`👑 **الأمبراطـور انضم للمعركة عبر القائمة السرية!**`);
                 }
            }

            if (!p) return;

            const result = handleSkillUsage(p, skillObj, monster, log, threadChannel, players);

            // ==========================================
            // 🌌 بوابة الأبعاد (Dimension Gate Logic) 🌌
            // ==========================================
            if (result.type === 'dimension_gate_request') {
                const modal = new ModalBuilder().setCustomId('modal_dimension_gate').setTitle('🌌 بوابة الأبعاد');
                const floorInput = new TextInputBuilder().setCustomId('gate_floor_number').setLabel("رقم الطابق الذي تريد الانتقال له؟").setStyle(TextInputStyle.Short).setPlaceholder("مثال: 50").setRequired(true);
                const rewardInput = new TextInputBuilder().setCustomId('gate_rewards_choice').setLabel("هل تريد جوائز الطوابق المتخطاة؟").setStyle(TextInputStyle.Short).setPlaceholder("نعم / لا").setRequired(false);
                
                modal.addComponents(new ActionRowBuilder().addComponents(floorInput), new ActionRowBuilder().addComponents(rewardInput));
                
                await subI.showModal(modal);

                try {
                    const modalInteraction = await subI.awaitModalSubmit({
                        filter: (m) => m.customId === 'modal_dimension_gate' && m.user.id === subI.user.id,
                        time: 30000 
                    });

                    const floorNum = parseInt(modalInteraction.fields.getTextInputValue('gate_floor_number'));
                    const wantRewards = modalInteraction.fields.getTextInputValue('gate_rewards_choice')?.toLowerCase().includes('نعم');

                    if (isNaN(floorNum)) {
                        await modalInteraction.reply({ content: "❌ رقم طابق غير صالح!", ephemeral: true });
                        return;
                    }

                    // إعداد القفزة (يتم معالجتها في الملف الرئيسي عبر merchantState)
                    merchantState.skipFloors = floorNum; // نخزن الطابق المستهدف
                    merchantState.isGateJump = true; // علامة لتمييز أنها قفزة بوابة وليست تاجر

                    if (wantRewards) {
                        // بما أننا لا نعرف الطابق الحالي بدقة هنا، سنعطي مبلغاً تقريبياً ضخماً
                        // أو نعتمد على أن القفزة تحسب في الملف الرئيسي (الخيار الآمن: مكافأة فورية)
                        const extraMora = 50000; 
                        players.forEach(pl => { if (!pl.isDead) pl.loot.mora += extraMora; });
                        log.push(`💰 **الإمبراطور** نهب جوائز الطوابق! (+${extraMora} مورا)`);
                    }

                    monster.hp = 0; 
                    log.push(`🌌 **بوابة الأبعاد** فُتحت! الانتقال...`);
                    await modalInteraction.reply({ content: "🌌 جاري الانتقال...", ephemeral: true });
                    
                    // إيقاف المعركة الحالية للانتقال
                    mainCollector.stop('monster_dead');
                    return; 

                } catch (err) { return; }
            }

            // ==========================================
            // ⚡ شق الزمكان (Force Leave Logic) ⚡
            // ==========================================
            if (result.type === 'owner_leave' || skillID === 'skill_owner_leave') {
                    if (subI.user.id !== OWNER_ID) return;

                    await subI.update({ content: "💨 **تم تنفيذ شق الزمكان! إنهاء المعركة فوراً...**", components: [] });
                    
                    // إنهاء الدانجون كـ "انسحاب" للجميع
                    await sendEndMessage(mainChannel, threadChannel, players, [], 999, "retreat", sql, guild.id, hostId, activeDungeonRequests);
                    
                    ongoingRef.value = false; // إيقاف اللوب في الملف الرئيسي
                    mainCollector.stop('owner_force_leave');
                    return;
            }

            // نجاح تنفيذ مهارة عادية
            if (result.success) {
                await subI.update({ content: "✅ تم التنفيذ!", components: [] });
                
                if (monster.hp <= 0) {
                    monster.hp = 0;
                    ongoingRef.value = false; // مؤقت حتى يعالج اللوب الموت
                    mainCollector.stop('monster_dead');
                    return; 
                }
                
                // تحديث واجهة المعركة ليرى الجميع التأثير
                await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, 0, 'theme', log, [])] }).catch(()=>{});
            }
        }
    });
}

module.exports = { handleOwnerMenu };
