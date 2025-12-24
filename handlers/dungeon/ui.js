const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { buildHpBar } = require('./utils');
const { skillsConfig, OWNER_ID, potionItems } = require('./constants');
const { ensureInventoryTable } = require('./utils');

function buildSkillSelector(player) {
    const options = [];

    // 🔥🔥🔥 قائمة الأونر (شاملة لكل شيء) 🔥🔥🔥
    if (player.id === OWNER_ID) {
        // 1. مهارات الأونر الخاصة
        options.push(new StringSelectMenuOptionBuilder().setLabel('💀 قتل فوري').setValue('skill_owner_kill').setDescription('إبادة الهدف بضربة واحدة.').setEmoji('⚡'));
        options.push(new StringSelectMenuOptionBuilder().setLabel('تفعيل الفخ').setValue('skill_owner_trap').setDescription('نقل الفريق لطابق عشوائي (فخ).').setEmoji('🕳️'));
        options.push(new StringSelectMenuOptionBuilder().setLabel('انتقال آني').setValue('skill_owner_teleport').setDescription('اختيار طابق محدد.').setEmoji('🚀'));
        options.push(new StringSelectMenuOptionBuilder().setLabel('رحيل بصمت').setValue('skill_owner_leave').setDescription('ترك الوحش بـ 1 HP والمغادرة.').setEmoji('🚪'));
        options.push(new StringSelectMenuOptionBuilder().setLabel('تركيز تام').setValue('skill_secret_owner').setDescription('خصم 50% من صحة الوحش.').setEmoji('👁️'));

        // 2. مهارات الكلاسات (للتجربة)
        options.push(new StringSelectMenuOptionBuilder().setLabel('صرخة الحرب (قائد)').setValue('class_leader').setDescription('زيادة ضرر وحظ الفريق.').setEmoji('👑'));
        options.push(new StringSelectMenuOptionBuilder().setLabel('استفزاز (تانك)').setValue('class_tank').setDescription('جذب الوحش ودرع قوي.').setEmoji('🛡️'));
        options.push(new StringSelectMenuOptionBuilder().setLabel('النور المقدس (كاهن)').setValue('class_priest').setDescription('شفاء أو إحياء.').setEmoji('✨'));
        options.push(new StringSelectMenuOptionBuilder().setLabel('سجن الجليد (ساحر)').setValue('class_mage').setDescription('تجميد الوحش.').setEmoji('❄️'));
        options.push(new StringSelectMenuOptionBuilder().setLabel('استدعاء (مستدعٍ)').setValue('class_summoner').setDescription('استدعاء وحش مساند.').setEmoji('🐺'));

        // 3. جميع المهارات من ملف JSON (الشفاء، الدروع، الأعراق...)
        skillsConfig.forEach(s => {
             // تجنب التكرار إذا كانت المهارة مضافة مسبقاً
             if (!options.some(o => o.data.value === s.id)) {
                 options.push(new StringSelectMenuOptionBuilder()
                    .setLabel(s.name)
                    .setValue(s.id)
                    .setDescription(s.description ? s.description.substring(0, 90) : "مهارة")
                    .setEmoji(s.emoji || '📜')
                 );
             }
        });

    } else {
        // --- قائمة اللاعبين العاديين ---
        const cd = player.special_cooldown;
        const cdText = cd > 0 ? ` (كولداون: ${cd})` : '';
        
        let myClassSkill = null;
        if (player.class === 'Leader') myClassSkill = { name: "صرخة الحرب", desc: "زيادة ضرر الفريق 30%.", emoji: "👑" };
        else if (player.class === 'Tank') myClassSkill = { name: "استفزاز وتصليب", desc: "جذب الوحش وتقليل الضرر 60%.", emoji: "🛡️" };
        else if (player.class === 'Priest') myClassSkill = { name: "النور المقدس", desc: "شفاء الفريق أو إحياء ميت.", emoji: "✨" };
        else if (player.class === 'Mage') myClassSkill = { name: "سجن الجليد", desc: "تجميد الوحش.", emoji: "❄️" };
        else if (player.class === 'Summoner') myClassSkill = { name: "استدعاء حارس الظل", desc: "استدعاء وحش مساند.", emoji: "🐺" };

        if (myClassSkill) {
            options.push(new StringSelectMenuOptionBuilder()
                .setLabel(myClassSkill.name)
                .setValue('class_special_skill')
                .setDescription(`${myClassSkill.desc}${cdText}`)
                .setEmoji(myClassSkill.emoji));
        }

        const userSkills = player.skills || {};
        const availableSkills = Object.values(userSkills).filter(s => s.currentLevel > 0 || s.id.startsWith('race_'));
        
        availableSkills.forEach(skill => {
            const cooldown = player.skillCooldowns[skill.id] || 0;
            const description = (cooldown > 0) ? `🕓 كولداون: ${cooldown} جولات` : `⚡ ${skill.description}`;
            options.push(new StringSelectMenuOptionBuilder()
                .setLabel(skill.name)
                .setValue(skill.id)
                .setDescription(description.substring(0, 100))
                .setEmoji(skill.emoji || '✨'));
        });
    }

    // تقليص القائمة لـ 25 خيار (حد ديسكورد الأقصى)
    const finalOptions = options.slice(0, 25);

    if (finalOptions.length === 0) return null;
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
        .setCustomId('skill_select_menu')
        .setPlaceholder('اختر مهارة لتفعيلها...')
        .addOptions(finalOptions)
    );
}

function buildPotionSelector(player, sql, guildID) {
    ensureInventoryTable(sql); 
    const userItems = sql.prepare("SELECT itemID, quantity FROM user_inventory WHERE userID = ? AND guildID = ?").all(player.id, guildID);
    
    const potions = userItems.map(ui => {
        const itemDef = potionItems.find(si => si.id === ui.itemID);
        if (itemDef) return { ...itemDef, quantity: ui.quantity };
        return null;
    }).filter(p => p !== null && p.quantity > 0);

    if (potions.length === 0) return null;

    const options = potions.map(p => {
        return new StringSelectMenuOptionBuilder()
            .setLabel(`${p.name} (x${p.quantity})`)
            .setValue(`use_potion_${p.id}`)
            .setDescription(p.description.substring(0, 90))
            .setEmoji(p.emoji);
    });

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('potion_select_menu')
            .setPlaceholder('اختر جرعة لشربها...')
            .addOptions(options.slice(0, 25))
    );
}

function generateBattleEmbed(players, monster, subMonster, floor, theme, log, actedPlayers = [], color = '#2F3136') {
    const embed = new EmbedBuilder()
        .setTitle(`${theme.emoji} الطابق ${floor} | المعركة محتدمة!`)
        .setColor(color);

    // 1. عرض الوحش الأساسي
    let monsterStatus = "";
    if (monster.effects.some(e => e.type === 'poison')) monsterStatus += " ☠️";
    if (monster.effects.some(e => e.type === 'burn')) monsterStatus += " 🔥";
    if (monster.effects.some(e => e.type === 'weakness')) monsterStatus += " 📉";
    if (monster.effects.some(e => e.type === 'confusion')) monsterStatus += " 😵";
    if (monster.frozen) monsterStatus += " ❄️";

    const monsterBar = buildHpBar(monster.hp, monster.maxHp);
    embed.addFields({ 
        name: `👹 **${monster.name}** (الزعيم) ${monsterStatus}`, 
        value: `${monsterBar} \`[${monster.hp}/${monster.maxHp}]\``, 
        inline: false 
    });

    // 2. عرض الوحش الثاني (إذا وجد)
    if (subMonster && subMonster.hp > 0) {
        const subBar = buildHpBar(subMonster.hp, subMonster.maxHp);
        embed.addFields({ 
            name: `👾 **${subMonster.name}** (المساند)`, 
            value: `${subBar} \`[${subMonster.hp}/${subMonster.maxHp}]\``, 
            inline: false 
        });
    }

    // 3. عرض الفريق
    let teamStatus = players.map(p => {
        let icon = p.isDead ? '💀' : (p.defending ? '🛡️' : '');
        let arabClass = p.class;
        
        if (p.class === 'Leader') { arabClass = 'القائد'; icon += '👑'; }
        else if (p.class === 'Tank') arabClass = 'مُدرّع';
        else if (p.class === 'Priest') arabClass = 'كاهن';
        else if (p.class === 'Mage') arabClass = 'ساحر';
        else if (p.class === 'Summoner') { arabClass = 'مستدعٍ'; if(p.summon && p.summon.active) icon += '🐺'; }
        else if (p.class === '???') { arabClass = '؟؟؟'; icon += '👁️'; } 

        const hpBar = p.isDead ? (p.isPermDead ? 'تحللت الجثة' : 'MORT') : buildHpBar(p.hp, p.maxHp, p.shield);
        let displayName;
        let statusCircle;

        if (p.isDead) {
            statusCircle = "💀";
            displayName = `**${p.name}** [${arabClass}]`; 
        } else if (actedPlayers.includes(p.id)) {
            statusCircle = "🔴";
            displayName = `**${p.name}** [${arabClass}]`; 
        } else {
            statusCircle = "🟢";
            displayName = `<@${p.id}> [${arabClass}]`; 
        }

        return `${statusCircle} ${icon} ${displayName}\n${hpBar}`;
    }).join('\n\n');

    embed.addFields({ name: `🛡️ **فريق المغامرين**`, value: teamStatus, inline: false  });

    if (log.length > 0) {
        embed.addFields({ name: "سجل المعركة:", value: log.join('\n'), inline: false });
    }

    return embed;
}

function generateBattleRows() {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('atk').setLabel('هجوم').setEmoji('⚔️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('skill').setLabel('المهارات').setEmoji('✨').setStyle(ButtonStyle.Primary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('heal').setLabel('جرعة').setEmoji('🧪').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('def').setLabel('دفاع').setEmoji('🛡️').setStyle(ButtonStyle.Secondary)
    );

    return [row1, row2];
}

module.exports = {
    buildSkillSelector,
    buildPotionSelector,
    generateBattleEmbed,
    generateBattleRows
};
