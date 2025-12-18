const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, Colors } = require('discord.js');
const path = require('path');

// --- تحميل الإعدادات ---
const rootDir = process.cwd();
const dungeonConfig = require(path.join(rootDir, 'json', 'dungeon-config.json'));
const weaponsConfig = require(path.join(rootDir, 'json', 'weapons-config.json'));
const skillsConfig = require(path.join(rootDir, 'json', 'skills-config.json'));

// --- ثوابت النظام ---
const EMOJI_MORA = '<:mora:1435647151349698621>'; 
const EMOJI_XP = '<a:levelup:1437805366048985290>'; 
const EMOJI_BUFF = '<a:buff:1438796257522094081>';
const EMOJI_NERF = '<a:Nerf:1438795685280612423>';
const OWNER_ID = "1145327691772481577"; 
const BASE_HP = 100;
const HP_PER_LEVEL = 4;

// --- صور النتائج ---
const WIN_IMAGES = [
    'https://i.postimg.cc/JhMrnyLd/download-1.gif',
    'https://i.postimg.cc/FHgv29L0/download.gif',
    'https://i.postimg.cc/9MzjRZNy/haru-midoriya.gif',
    'https://i.postimg.cc/4ygk8q3G/tumblr-nmao11Zm-Bx1r3rdh2o2-500-gif-500-281.gif',
    'https://i.postimg.cc/pL6NNpdC/Epic7-Epic-Seven-GIF-Epic7-Epic-Seven-Tensura-Discover-Share-GIFs.gif',
    'https://i.postimg.cc/05dLktNF/download-5.gif',
    'https://i.postimg.cc/sXRVMwhZ/download-2.gif'
];

const LOSE_IMAGES = [
    'https://i.postimg.cc/xd8msjxk/escapar-a-toda-velocidad.gif',
    'https://i.postimg.cc/1zb8JGVC/download.gif',
    'https://i.postimg.cc/rmSwjvkV/download-1.gif',
    'https://i.postimg.cc/8PyPZRqt/download.jpg'
];

// --- الدوال المساعدة (Helpers) ---

/**
 * دالة مركزية لتطبيق الضرر مع مراعاة الدرع
 * تخصم من الدرع أولاً ثم الـ HP
 */
function applyDamageToPlayer(player, damageAmount) {
    let remainingDamage = damageAmount;
    if (player.shield > 0) {
        if (remainingDamage <= player.shield) {
            player.shield -= remainingDamage;
            remainingDamage = 0;
        } else {
            remainingDamage -= player.shield;
            player.shield = 0;
        }
    }
    player.hp -= remainingDamage;
    if (player.hp < 0) player.hp = 0;
}

function getBaseFloorMora(floor) {
    if (floor <= 10) return 100;
    const tier = floor - 10;
    return Math.floor(100 + (tier * 50) + (Math.pow(tier, 1.8))); 
}

function getDungeonBuff(floor) {
    if (floor >= 15) return { percent: 20, minutes: 30 };
    if (floor >= 9) return { percent: 10, minutes: 10 };
    if (floor >= 5) return { percent: 5, minutes: 5 };
    return { percent: 0, minutes: 0 };
}

function cleanDisplayName(name) {
    if (!name) return "لاعب";
    let clean = name.replace(/<a?:.+?:\d+>/g, '');
    clean = clean.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\DFFF]|\uD83D[\uDC00-\DFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\DFFF]/g, '');
    clean = clean.replace(/^[\s\d\[\]|.,\-#]+/, '');
    clean = clean.replace(/[\s\d\[\]|.,\-#]+$/, '');
    return clean.trim() || "لاعب";
}

function buildHpBar(currentHp, maxHp, shield = 0) {
    currentHp = Math.max(0, currentHp);
    const percentage = (currentHp / maxHp) * 10;
    const filled = '█';
    const empty = '░';
    let bar = `[${filled.repeat(Math.max(0, Math.floor(percentage))) + empty.repeat(Math.max(0, 10 - Math.floor(percentage)))}] ${currentHp}/${maxHp}`;
    if (shield > 0) bar += ` 🛡️(${shield})`;
    return bar;
}

function getRealPlayerData(member, sql, assignedClass = 'Adventurer') {
    const guildID = member.guild.id;
    const userID = member.id;
    const userData = sql.prepare("SELECT level FROM levels WHERE user = ? AND guild = ?").get(userID, guildID);
    const level = userData ? userData.level : 1;
    const maxHp = BASE_HP + (level * HP_PER_LEVEL);

    let damage = 15;
    let weaponName = "قبضة اليد";
      
    const allRaceRoles = sql.prepare("SELECT roleID, raceName FROM race_roles WHERE guildID = ?").all(member.guild.id);
    const userRoleIDs = member.roles.cache.map(r => r.id);
    const userRace = allRaceRoles.find(r => userRoleIDs.includes(r.roleID));

    if (userRace) {
        const weaponConfig = weaponsConfig.find(w => w.race === userRace.raceName);
        if (weaponConfig) {
            const userWeapon = sql.prepare("SELECT * FROM user_weapons WHERE userID = ? AND guildID = ? AND raceName = ?").get(userID, guildID, userRace.raceName);
            if (userWeapon && userWeapon.weaponLevel > 0) {
                damage = weaponConfig.base_damage + (weaponConfig.damage_increment * (userWeapon.weaponLevel - 1));
                weaponName = `${weaponConfig.name} (Lv.${userWeapon.weaponLevel})`;
            }
        }
    }

    const skillsOutput = {};
    const userSkillsData = sql.prepare("SELECT * FROM user_skills WHERE userID = ? AND guildID = ?").all(member.id, member.guild.id);
      
    if (userSkillsData) {
        userSkillsData.forEach(userSkill => {
            const skillConfig = skillsConfig.find(s => s.id === userSkill.skillID);
            if (skillConfig && userSkill.skillLevel > 0) {
                const effectValue = skillConfig.base_value + (skillConfig.value_increment * (userSkill.skillLevel - 1));
                skillsOutput[skillConfig.id] = { ...skillConfig, currentLevel: userSkill.skillLevel, effectValue: effectValue };
            }
        });
    }

    if (userRace) {
        const raceSkillId = `race_${userRace.raceName.toLowerCase().replace(/\s+/g, '_')}_skill`;
        const raceSkillConfig = skillsConfig.find(s => s.id === raceSkillId);
        if (raceSkillConfig && !skillsOutput[raceSkillId]) {
            skillsOutput[raceSkillId] = { ...raceSkillConfig, currentLevel: 1, effectValue: raceSkillConfig.base_value };
        }
    }

    return {
        id: userID,
        name: cleanDisplayName(member.displayName),
        avatar: member.user.displayAvatarURL(),
        level: level,
        hp: maxHp,
        maxHp: maxHp,
        atk: damage,
        weaponName: weaponName,
        skills: skillsOutput,
        isDead: false,
        defending: false,
        potions: 3,
        skillCooldowns: {},
        shield: 0,
        tempAtkMultiplier: 1.0,
        effects: [],
        totalDamage: 0,
        skipCount: 0, 
        loot: { mora: 0, xp: 0 },
        class: assignedClass, 
        special_cooldown: 0, 
        summon: null 
    };
}

function getRandomMonster(type, theme) {
    let pool = [];
    if (type === 'boss') pool = dungeonConfig.monsters.bosses;
    else if (type === 'guardian') pool = dungeonConfig.monsters.guardians;
    else if (type === 'elite') pool = dungeonConfig.monsters.elites;
    else pool = dungeonConfig.monsters.minions;
     
    if (!pool || pool.length === 0) pool = dungeonConfig.monsters.minions;

    const name = pool[Math.floor(Math.random() * pool.length)];
    return { name, emoji: theme.emoji };
}

function buildSkillSelector(player) {
    const options = [];

    if (player.id === OWNER_ID) {
        options.push(new StringSelectMenuOptionBuilder().setLabel('تركيز تام').setValue('skill_secret_owner').setDescription('ضربة قاضية خاصة بالمالك.').setEmoji('👁️'));
        options.push(new StringSelectMenuOptionBuilder().setLabel('صرخة الحرب').setValue('class_leader').setDescription('زيادة ضرر الفريق 30%.').setEmoji('👑'));
        options.push(new StringSelectMenuOptionBuilder().setLabel('استفزاز وتصليب').setValue('class_tank').setDescription('جذب الوحش وتقليل الضرر 60%.').setEmoji('🛡️'));
        options.push(new StringSelectMenuOptionBuilder().setLabel('النور المقدس').setValue('class_priest').setDescription('شفاء الفريق أو إحياء ميت.').setEmoji('✨'));
        options.push(new StringSelectMenuOptionBuilder().setLabel('سجن الجليد').setValue('class_mage').setDescription('تجميد الوحش.').setEmoji('❄️'));
        options.push(new StringSelectMenuOptionBuilder().setLabel('استدعاء حارس الظل').setValue('class_summoner').setDescription('استدعاء وحش مساند.').setEmoji('🐺'));

        skillsConfig.forEach(s => {
             if (!options.some(o => o.data.value === s.id)) {
                 options.push(new StringSelectMenuOptionBuilder().setLabel(s.name).setValue(s.id).setDescription(s.description ? s.description.substring(0, 90) : "مهارة").setEmoji(s.emoji || '📜'));
             }
        });

    } else {
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

    if (options.length === 0) return null;
    const slicedOptions = options.slice(0, 25); 

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
        .setCustomId('skill_select_menu')
        .setPlaceholder('اختر مهارة لتفعيلها...')
        .addOptions(slicedOptions)
    );
}

function handleSkillUsage(player, skill, monster, log) {
    let skillDmg = 0;
    const mult = (player.id === OWNER_ID) ? 10 : 1;

    if (skill.id === 'skill_secret_owner') {
        skillDmg = Math.floor(monster.maxHp * 0.50); 
        monster.hp -= skillDmg;
        player.totalDamage += skillDmg;
        log.push(`👁️ **${player.name}** استخدم "تركيز تام" وقصم الوحش لنصفين! (**${skillDmg}** ضرر)`);
        return;
    }

    let classType = null;
    if (skill.id === 'class_special_skill') {
        classType = player.class;
    } else if (skill.id.startsWith('class_')) {
        let rawType = skill.id.split('_')[1]; 
        classType = rawType.charAt(0).toUpperCase() + rawType.slice(1);
    }

    if (classType) {
         if (player.special_cooldown > 0 && player.id !== OWNER_ID) {
             return { error: `انتظر ${player.special_cooldown} دور.` }; 
         }

         switch(classType) {
             case 'Leader': return { type: 'class_effect', effect: 'leader_buff', cooldown: 5 }; 
             case 'Tank': return { type: 'class_effect', effect: 'tank_taunt', cooldown: 4 };
             case 'Priest': return { type: 'class_effect', effect: 'priest_heal', cooldown: (player.id===OWNER_ID?0:6) };
             case 'Mage': return { type: 'class_effect', effect: 'mage_freeze', cooldown: 5 };
             case 'Summoner': return { type: 'class_effect', effect: 'summon_pet', cooldown: 6 };
         }
         return;
    }

    const value = skill.effectValue || (skill.base_value ? skill.base_value * (player.id === OWNER_ID ? 2 : 1) : 0); 

    switch (skill.id) {
        case 'skill_rebound': {
             const reflectPercent = (value / 100) * mult;
             player.effects.push({ type: 'counter', val: reflectPercent, turns: 1 });
             log.push(`🔄 **${player.name}** دخل وضعية الارتداد!`);
             break;
        }
        case 'skill_healing':
        case 'skill_cleanse': {
            let healAmount = Math.floor(player.maxHp * (value / 100)) * mult;
            if (skill.id === 'skill_cleanse') {
                player.effects = []; 
                log.push(`✨ **${player.name}** تطهر وشفى **${healAmount}** HP.`);
            } else {
                log.push(`❤️‍🩹 **${player.name}** استخدم ${skill.name} واستعاد **${healAmount}** HP.`);
            }
            player.hp = Math.min(player.maxHp, player.hp + healAmount);
            break;
        }
        case 'skill_shielding':
        case 'race_human_skill': {
             let shieldAmount = Math.floor(player.maxHp * (value / 100)) * mult;
             player.shield = shieldAmount; 
             log.push(`${skill.emoji} **${player.name}** فعل درعاً بقوة **${shieldAmount}**.`);
             if (skill.id === 'race_human_skill') {
                 player.effects.push({ type: 'atk_buff', val: 0.2, turns: 2 });
                 log.push(`⚔️ **${player.name}** زادت عزيمته (ATK UP)!`);
             }
             break;
        }
        case 'race_dwarf_skill': {
             skillDmg = Math.floor(player.atk * 1.5) * mult;
             monster.hp -= skillDmg;
             player.totalDamage += skillDmg;
             if (player.shield <= 0) {
                 let addedShield = Math.floor(player.maxHp * 0.15) * mult;
                 player.shield = addedShield;
                 log.push(`🛡️ **${player.name}** ضرب بترسه (${skillDmg}) واكتسب درعاً (${addedShield})!`);
             } else {
                 log.push(`🛡️ **${player.name}** ضرب بترسه (${skillDmg}) (لديك درع بالفعل).`);
             }
             break;
        }
        case 'skill_buffing': {
             player.effects.push({ type: 'atk_buff', val: (value / 100) * mult, turns: 3 });
             log.push(`💪 **${player.name}** رفع قوته الهجومية!`);
             break;
        }
        case 'skill_poison':
        case 'race_dark_elf_skill': {
             skillDmg = Math.floor(player.atk * 0.5) * mult; 
             monster.effects.push({ type: 'poison', val: Math.floor(player.atk * (value/100)) * mult, turns: 3 });
             monster.hp -= skillDmg;
             player.totalDamage += skillDmg; 
             log.push(`☠️ **${player.name}** سمم الوحش! (ضرر ${skillDmg}).`);
             break;
        }
        case 'skill_gamble': {
             const isSuccess = Math.random() < 0.5; 
             if (isSuccess) {
                 const bonusDmg = Math.floor(Math.random() * (250 - 80 + 1)) + 80;
                 skillDmg = (player.atk + bonusDmg) * mult; 
                 log.push(`🎲 **${player.name}** خاطر ونجح! سدد ضربة قوية بمقدار **${skillDmg}**!`);
             } else {
                 const selfDamage = Math.floor(Math.random() * (70 - 30 + 1)) + 30;
                 skillDmg = 0;
                 // 🔥 تم التعديل: خصم الضرر من الدرع أولاً
                 applyDamageToPlayer(player, selfDamage);
                 log.push(`🎲 **${player.name}** خسر الرهان! وانفجرت النردات مسببة **${selfDamage}** ضرر!`);
             }
             if (skillDmg > 0) {
                monster.hp -= skillDmg;
                player.totalDamage += skillDmg; 
             }
             break;
        }
        case 'race_dragon_skill': {
             skillDmg = (Math.floor(player.atk * 1.5) + value) * mult;
             monster.hp -= skillDmg;
             player.totalDamage += skillDmg; 
             log.push(`🔥 **${player.name}** أطلق ${skill.name} بـ **${skillDmg}** ضرر!`);
             break;
        }
        case 'race_seraphim_skill':
        case 'race_vampire_skill': {
             skillDmg = (Math.floor(player.atk * 1.2) + value) * mult;
             const lifesteal = Math.floor(skillDmg * (skill.id === 'race_vampire_skill' ? 0.6 : 0.4));
             monster.hp -= skillDmg;
             player.totalDamage += skillDmg; 
             player.hp = Math.min(player.maxHp, player.hp + lifesteal);
             log.push(`${skill.emoji} **${player.name}** امتص حياة الخصم! (**${skillDmg}** ضرر / **+${lifesteal}** HP).`);
             break;
        }
        case 'race_demon_skill': {
             const selfDmg = Math.floor(player.maxHp * 0.10); 
             skillDmg = (Math.floor(player.atk * 2.5) + value) * mult;
             // 🔥 تم التعديل: خصم التضحية من الدرع أولاً
             applyDamageToPlayer(player, selfDmg);
             monster.hp -= skillDmg;
             player.totalDamage += skillDmg; 
             log.push(`🩸 **${player.name}** ضحى بقوته (**-${selfDmg}**) ليسبب **${skillDmg}**!`);
             break;
        }
        case 'race_elf_skill': {
             const hit1 = Math.floor(player.atk * 0.9) * mult;
             const hit2 = Math.floor(player.atk * 0.9) * mult;
             skillDmg = hit1 + hit2;
             monster.hp -= skillDmg;
             player.totalDamage += skillDmg; 
             log.push(`🏹 **${player.name}** أطلق سهمين دقيقين! (**${skillDmg}**).`);
             break;
        }
        case 'skill_weaken': {
             skillDmg = Math.floor(player.atk * 0.5) * mult;
             monster.effects.push({ type: 'weakness', val: 0.25, turns: 2 }); 
             monster.hp -= skillDmg;
             player.totalDamage += skillDmg; 
             log.push(`📉 **${player.name}** أضعف الوحش وسبب **${skillDmg}** ضرر.`);
             break;
        }
        case 'race_ghoul_skill': {
             let missingHpPercent = 1 - (player.hp / player.maxHp);
             let rageMult = 1.5 + (missingHpPercent * 2.5);
             skillDmg = Math.floor(player.atk * rageMult) * mult;
             monster.hp -= skillDmg;
             player.totalDamage += skillDmg; 
             log.push(`🧟 **${player.name}** هاج بجنون (HP ${(player.hp/player.maxHp*100).toFixed(0)}%) وسبب **${skillDmg}** ضرر!`);
             break;
        }
        case 'race_spirit_skill': {
             skillDmg = Math.floor(player.atk * 1.8) * mult;
             monster.hp -= skillDmg;
             player.totalDamage += skillDmg; 
             player.effects.push({ type: 'evasion', val: 0.5, turns: 1 });
             log.push(`👻 **${player.name}** ضرب بطيفية (${skillDmg}) وأصبح مراوغاً!`);
             break;
        }
        case 'skill_dispel': {
            monster.effects = monster.effects.filter(e => e.type === 'poison'); 
            log.push(`💨 **${player.name}** بدد السحر!`);
            break;
        }
        case 'race_hybrid_skill': {
            skillDmg = Math.floor(player.atk * 1.2) * mult;
            monster.hp -= skillDmg;
            player.effects.push({ type: 'atk_buff', val: 0.2 * mult, turns: 2 });
            log.push(`🌀 **${player.name}** سرق قوة الخصم (+ATK) وسبب **${skillDmg}** ضرر!`);
            break;
        }
        default: {
            let multiplier = skill.stat_type === '%' ? (1 + (value/100)) : 1;
            skillDmg = Math.floor((player.atk * multiplier) + (skill.stat_type !== '%' ? value : 0)) * mult;
            monster.hp -= skillDmg;
            player.totalDamage += skillDmg; 
            log.push(`💥 **${player.name}** استخدم ${skill.name} بـ **${skillDmg}** ضرر!`);
            break;
        }
    }
}

function generateBattleEmbed(players, monster, floor, theme, log, actedPlayers = [], color = '#2F3136') {
    const embed = new EmbedBuilder()
        .setTitle(`${theme.emoji} الطابق ${floor} | ضد ${monster.name}`)
        .setColor(color);

    let monsterStatus = "";
    if (monster.effects.some(e => e.type === 'poison')) monsterStatus += " ☠️";
    if (monster.effects.some(e => e.type === 'weakness')) monsterStatus += " 📉";
    if (monster.frozen) monsterStatus += " ❄️(متجمد)";

    const monsterBar = buildHpBar(monster.hp, monster.maxHp);
    embed.addFields({ 
        name: `👹 **${monster.name}** ${monsterStatus}`, 
        value: `${monsterBar} \`[${monster.hp}/${monster.maxHp}]\``, 
        inline: false 
    });

    let teamStatus = players.map(p => {
        let icon = p.isDead ? '💀' : (p.defending ? '🛡️' : '❤️');
        
        let arabClass = p.class;
        if (p.class === 'Leader') { arabClass = 'القائد'; icon += '👑'; }
        else if (p.class === 'Tank') arabClass = 'مُدرّع';
        else if (p.class === 'Priest') arabClass = 'كاهن';
        else if (p.class === 'Mage') arabClass = 'ساحر';
        else if (p.class === 'Summoner') { arabClass = 'مستدعٍ'; if(p.summon && p.summon.active) icon += '🐺'; }

        const hpBar = p.isDead ? 'MORT' : buildHpBar(p.hp, p.maxHp, p.shield);
          
        let displayName;
        if (p.isDead || actedPlayers.includes(p.id)) {
            displayName = `**${p.name}** [${arabClass}]`; 
        } else {
            displayName = `<@${p.id}> [${arabClass}]`; 
        }

        return `${icon} ${displayName}\n${hpBar}`;
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

async function runDungeon(threadChannel, mainChannel, partyIDs, theme, sql, hostId, partyClasses, activeDungeonRequests) {
    const guild = threadChannel.guild;
    let players = [];
     
    const promises = partyIDs.map(id => guild.members.fetch(id).catch(() => null));
    const members = await Promise.all(promises);

    members.forEach((m, index) => {
        if (m) {
            const cls = partyClasses.get(m.id) || 'Adventurer';
            players.push(getRealPlayerData(m, sql, cls));
        }
    });

    if (players.length === 0) {
        activeDungeonRequests.delete(hostId);
        return threadChannel.send("❌ خطأ: لم يتم العثور على اللاعبين.");
    }

    const maxFloors = 100; 
    let totalAccumulatedCoins = 0;
    let totalAccumulatedXP = 0;

    for (let floor = 1; floor <= maxFloors; floor++) {
        if (players.every(p => p.isDead)) break; 

        for (let p of players) {
            if (!p.isDead) { 
                p.shield = 0; p.effects = []; p.defending = false; p.summon = null; 
            } 
        }

        const floorConfig = dungeonConfig.floors.find(f => f.floor === floor) || dungeonConfig.floors[dungeonConfig.floors.length - 1];
        const randomMob = getRandomMonster(floorConfig.type, theme);

        let baseFloorHP = (floor <= 10) ? 500 + ((floor - 1) * 100) : 500 + (floor * 150) + (Math.pow(floor, 2) * 8);
        let finalHp = Math.floor(Math.floor(baseFloorHP) * (floorConfig.hp_mult || 1));
        let baseAtk = 15 + (floor * 3);
        let finalAtk = Math.floor(baseAtk * (floorConfig.atk_mult || 1));

        let monster = {
            name: `${randomMob.name} (Lv.${floor})`, 
            hp: finalHp, maxHp: finalHp, atk: finalAtk, 
            enraged: false, effects: [], targetFocusId: null, frozen: false 
        };

        let log = [`⚠️ **الطابق ${floor}/${maxFloors}**: ظهر **${monster.name}**! (HP: ${monster.maxHp.toLocaleString()} | DMG: ${monster.atk})`];
        let ongoing = true;
        let turnCount = 0;

        const battleMsg = await threadChannel.send({ 
            embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])], 
            components: generateBattleRows() 
        });

        while (ongoing) {
            const collector = battleMsg.createMessageComponentCollector({ time: 60000 });
            let actedPlayers = [];
            let processingUsers = new Set(); 

            await new Promise(resolve => {
                const turnTimeout = setTimeout(() => { 
                    const afkPlayers = players.filter(p => !p.isDead && !actedPlayers.includes(p.id));
                    if (afkPlayers.length > 0) {
                          afkPlayers.forEach(afkP => {
                                afkP.skipCount = (afkP.skipCount || 0) + 1;
                                if (afkP.skipCount >= 5) {
                                    afkP.hp = 0; afkP.isDead = true;
                                    threadChannel.send(`💀 **${afkP.name}** تم استبعاده لتجاوز وقت الانتظار!`).catch(()=>{});
                                } else {
                                    monster.targetFocusId = afkP.id;
                                    threadChannel.send(`⏩ **${afkP.name}** لم يهاجم! (تخطي: ${afkP.skipCount}/5)`).catch(()=>{});
                                }
                          });
                    }
                    collector.stop('turn_end'); 
                }, 45000); 

                collector.on('collect', async i => {
                    let p = players.find(pl => pl.id === i.user.id);
                    if (!p) return i.reply({ content: "🚫 لست مشاركاً!", ephemeral: true });
                    if (p.isDead || actedPlayers.includes(p.id)) {
                        if (!i.replied && !i.deferred) await i.reply({ content: "⏳ انتظر دورك.", ephemeral: true });
                        return;
                    }
                    if (processingUsers.has(i.user.id)) { await i.deferUpdate().catch(()=>{}); return; }
                    processingUsers.add(i.user.id);

                    try {
                        if (i.customId === 'skill') {
                            const skillRow = buildSkillSelector(p);
                            if (!skillRow) {
                                await i.reply({ content: "❌ لا توجد مهارات.", ephemeral: true });
                                processingUsers.delete(i.user.id); return;
                            }
                            try {
                                const skillMsg = await i.reply({ content: "✨ **اختر المهارة:**", components: [skillRow], ephemeral: true, fetchReply: true });
                                const selection = await skillMsg.awaitMessageComponent({ filter: subI => subI.user.id === i.user.id, time: 10000 });
                                const skillId = selection.values[0];
                                
                                const shieldSkills = ['skill_shielding', 'race_human_skill'];
                                if (shieldSkills.includes(skillId) && p.shield > 0) {
                                    await selection.reply({ content: `🛡️ **لديك درع نشط بالفعل!**`, ephemeral: true });
                                    processingUsers.delete(i.user.id); return; 
                                }

                                await selection.deferUpdate().catch(()=>{}); 
                                actedPlayers.push(p.id);

                                let skillNameUsed = "مهارة";

                                if (skillId === 'class_special_skill' || skillId.startsWith('class_')) {
                                    const res = handleSkillUsage(p, { id: skillId }, monster, log);
                                    
                                    if (res && res.error) {
                                        await selection.editReply({ content: `⏳ ${res.error}`, components: [] }).catch(()=>{});
                                        processingUsers.delete(i.user.id); return;
                                    }

                                    if (res && res.type === 'class_effect') {
                                        if (res.effect === 'leader_buff') {
                                            players.forEach(m => { if(!m.isDead) m.effects.push({ type: 'atk_buff', val: 0.3, turns: 2 }); });
                                            log.push(`⚔️ **${p.name}** أطلق صرخة الحرب!`);
                                            skillNameUsed = "صرخة الحرب";
                                        } else if (res.effect === 'tank_taunt') {
                                            monster.targetFocusId = p.id;
                                            p.effects.push({ type: 'def_buff', val: 0.6, turns: 1 });
                                            log.push(`🛡️ **${p.name}** استفز الوحش!`);
                                            skillNameUsed = "استفزاز وتصليب";
                                        } else if (res.effect === 'priest_heal') {
                                            const dead = players.filter(m => m.isDead);
                                            if (dead.length > 0) {
                                                const t = dead[0]; t.isDead = false; t.hp = Math.floor(t.maxHp * 0.2);
                                                applyDamageToPlayer(p, Math.floor(p.maxHp * 0.1));
                                                log.push(`✨ **${p.name}** أحيا **${t.name}**!`);
                                                p.special_cooldown = 7;
                                            } else {
                                                players.forEach(m => { if(!m.isDead) m.hp = Math.min(m.maxHp, m.hp + Math.floor(m.maxHp * 0.4)); });
                                                log.push(`✨ **${p.name}** عالج الفريق!`);
                                                p.special_cooldown = 6;
                                            }
                                            skillNameUsed = "النور المقدس";
                                        } else if (res.effect === 'mage_freeze') {
                                            monster.frozen = true;
                                            log.push(`❄️ **${p.name}** جمد الوحش!`);
                                            skillNameUsed = "سجن الجليد";
                                        } else if (res.effect === 'summon_pet') {
                                            p.summon = { active: true, turns: 3 };
                                            log.push(`🐺 **${p.name}** استدعى الحارس!`);
                                            skillNameUsed = "استدعاء حارس الظل";
                                        }
                                        
                                        if (res.cooldown && res.effect !== 'priest_heal') p.special_cooldown = res.cooldown;
                                    }
                                } 
                                else {
                                    let skillObj = { id: skillId, name: 'Skill', effectValue: 0 };
                                    if (skillId === 'skill_secret_owner') skillObj = { id: skillId, name: 'تركيز تام' };
                                    else if (p.skills[skillId]) skillObj = p.skills[skillId];
                                    else if (p.id === OWNER_ID) {
                                        const sConf = skillsConfig.find(s=>s.id === skillId);
                                        if(sConf) skillObj = { ...sConf, effectValue: sConf.base_value * 2 };
                                    }

                                    if (skillId !== 'skill_secret_owner' && p.id !== OWNER_ID && (p.skillCooldowns[skillId] || 0) > 0) {
                                         await selection.editReply({ content: `⏳ كولداون.`, components: [] }).catch(()=>{});
                                         processingUsers.delete(i.user.id); return;
                                    }

                                    handleSkillUsage(p, skillObj, monster, log);
                                    skillNameUsed = skillObj.name;
                                    if (skillId !== 'skill_secret_owner' && p.id !== OWNER_ID) p.skillCooldowns[skillId] = 3;
                                }

                                p.skipCount = 0; 
                                await selection.editReply({ content: `✅ تم استخدام: ${skillNameUsed}`, components: [] }).catch(()=>{});

                            } catch (err) { 
                                if (err.code !== 10062) await i.editReply({ content: "⏰ انتهى الوقت.", components: [] }).catch(()=>{}); 
                                processingUsers.delete(i.user.id); return; 
                            }
                        } 
                        else if (i.customId === 'heal') {
                            if (p.potions > 0) {
                                await i.deferUpdate().catch(()=>{});
                                p.hp = Math.min(p.hp + Math.floor(p.maxHp * 0.35), p.maxHp);
                                p.potions--;
                                log.push(`🧪 **${p.name}** تجرع الترياق.`);
                                await i.followUp({ content: `🧪 (+HP) متبقي: ${p.potions}`, ephemeral: true }).catch(()=>{});
                                actedPlayers.push(p.id);
                                p.skipCount = 0;
                            } else {
                                await i.reply({ content: "❌ لا تملك جرعات!", ephemeral: true });
                                processingUsers.delete(i.user.id); return; 
                            }
                        } else if (i.customId === 'atk' || i.customId === 'def') {
                            await i.deferUpdate().catch(()=>{});
                            actedPlayers.push(p.id);
                            p.skipCount = 0;

                            if (i.customId === 'atk') {
                                let atkMultiplier = 1.0;
                                p.effects.forEach(e => { if(e.type === 'atk_buff') atkMultiplier += e.val; });
                                const currentAtk = Math.floor(p.atk * atkMultiplier);
                                const isCrit = Math.random() < 0.2;
                                let dmg = Math.floor(currentAtk * (0.9 + Math.random() * 0.2));
                                if (isCrit) dmg = Math.floor(dmg * 1.5);
                                monster.hp -= dmg;
                                p.totalDamage += dmg; 
                                log.push(`🗡️ **${p.name}** ${isCrit ? '**CRIT!**' : ''} سبب ${dmg} ضرر.`);
                            } else if (i.customId === 'def') {
                                p.defending = true;
                                log.push(`🛡️ **${p.name}** يدافع!`);
                            }
                        }

                        if (monster.hp <= 0) {
                            monster.hp = 0;
                            if (log.length > 5) log = log.slice(-5);
                            await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, actedPlayers)] }).catch(e => {});
                            collector.stop('monster_dead'); 
                            return; 
                        }

                        if (log.length > 5) log = log.slice(-5);
                        await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, actedPlayers)] }).catch(e => {});

                        if (actedPlayers.length >= players.filter(pl => !pl.isDead).length) { 
                            clearTimeout(turnTimeout); collector.stop('turn_end'); 
                        }
                    } catch (error) { console.error(error); } finally { processingUsers.delete(i.user.id); }
                });

                collector.on('end', () => { clearTimeout(turnTimeout); resolve(); });
            });

            players.forEach(p => {
                if (p.summon && p.summon.active) {
                    const summonDmg = Math.floor(p.atk * 0.8);
                    monster.hp -= summonDmg;
                    log.push(`🐺 **حارس الظل** (${p.name}) عض الوحش! (-${summonDmg})`);
                    p.summon.turns--;
                    if (p.summon.turns <= 0) {
                        const explodeDmg = Math.floor(p.atk * 2.0);
                        monster.hp -= explodeDmg;
                        log.push(`💥 **حارس الظل** انفجر مسبباً ضرراً هائلاً! (-${explodeDmg})`);
                        p.summon = null;
                    }
                }
            });

            if (monster.hp <= 0) { ongoing = false; await battleMsg.edit({ components: [] }).catch(()=>{}); }

            players.forEach(p => { 
                for (const sid in p.skillCooldowns) if (p.skillCooldowns[sid] > 0) p.skillCooldowns[sid]--; 
                if (p.special_cooldown > 0) p.special_cooldown--; 
                p.effects = p.effects.filter(e => { e.turns--; return e.turns > 0; });
            });

            if (monster.effects.length > 0) {
                monster.effects = monster.effects.filter(e => {
                    if (e.type === 'poison') { monster.hp -= e.val; log.push(`☠️ **${monster.name}** سم (-${e.val}).`); }
                    e.turns--; return e.turns > 0;
                });
            }

            if (monster.hp <= 0) ongoing = false;
            else {
                turnCount++;
                if (monster.frozen) {
                    log.push(`❄️ **${monster.name}** متجمد!`);
                    monster.frozen = false;
                } else {
                    const alive = players.filter(p => !p.isDead);
                    if (alive.length > 0) {
                        let target = monster.targetFocusId ? alive.find(p => p.id === monster.targetFocusId) : null;
                        if (!target) target = alive[Math.floor(Math.random() * alive.length)];
                        
                        let dmg = Math.floor(monster.atk * (1 + turnCount * 0.05));
                        if(target.effects.some(e=>e.type==='def_buff')) dmg = Math.floor(dmg * 0.4);
                        if(target.defending) dmg = Math.floor(dmg * 0.5);
                        
                        // 🔥 تم التعديل: تطبيق الضرر مع خصم الدرع أولاً للهجمات العادية للوحش
                        applyDamageToPlayer(target, dmg);
                        
                        log.push(`👹 **${monster.name}** ضرب **${target.name}** (${dmg})`);
                        if(target.hp <= 0) { target.hp = 0; target.isDead = true; log.push(`💀 **${target.name}** سقط!`); }
                    }
                }
                
                if (players.every(p => p.isDead)) {
                    ongoing = false;
                    await sendEndMessage(mainChannel, threadChannel, players, floor, "lose", sql, guild.id, hostId, activeDungeonRequests);
                    return;
                }
                
                players.forEach(p => p.defending = false);
                if (log.length > 5) log = log.slice(-5);
                await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])] }).catch(()=>{});
            }
        }
        
        if (!ongoing && monster.hp <= 0) {
             await battleMsg.edit({ components: [] }).catch(()=>{});
             await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])] }).catch(()=>{});

             let baseMora = Math.floor(getBaseFloorMora(floor));
             let floorXp = Math.floor(baseMora / 3); 

             players.forEach(p => { 
                 if (!p.isDead) { 
                     p.loot.mora += baseMora; 
                     p.loot.xp += floorXp; 
                 }
             });

             totalAccumulatedCoins += baseMora;
             totalAccumulatedXP += floorXp;

             if (floor === maxFloors) {
                 await sendEndMessage(mainChannel, threadChannel, players, floor, "win", sql, guild.id, hostId, activeDungeonRequests);
                 return; 
             }

             const decisionEmbed = new EmbedBuilder()
                 .setTitle('❖ استـراحـة بيـن الطـوابـق')
                 .setDescription([
                     `✶ نجحتـم في تصفية الطابق الـ: **${floor}**`,
                     `✶ تم استعادة صحة المغامرين بنسبة **%30**`,
                     `\n**✶ الغنـائـم المتراكمة:**`,
                     `✬ Mora: **${totalAccumulatedCoins.toLocaleString()}** ${EMOJI_MORA}`,
                     `✬ XP: **${totalAccumulatedXP.toLocaleString()}** ${EMOJI_XP}`,
                     `\n- القرار بيد **القائد** للاستمرار أو الانسحاب!`
                 ].join('\n'))
                 .setColor(Colors.Red)
                 .setImage('https://i.postimg.cc/KcJ6gtzV/22.jpg');

             const row = new ActionRowBuilder().addComponents(
                 new ButtonBuilder().setCustomId('dungeon_continue').setLabel('الاستمرار').setStyle(ButtonStyle.Success),
                 new ButtonBuilder().setCustomId('dungeon_retreat').setLabel('انسـحـاب').setStyle(ButtonStyle.Danger)
             );

             const dMsg = await threadChannel.send({ embeds: [decisionEmbed], components: [row] });
             
             const floorDecision = await new Promise(resolve => {
                 const decisionCollector = dMsg.createMessageComponentCollector({ time: 60000 });
                 
                 decisionCollector.on('collect', async i => {
                       const clicker = players.find(p => p.id === i.user.id);
                       
                       if (i.customId === 'dungeon_retreat') {
                          if (i.user.id === hostId) {
                               await i.update({ components: [] });
                               resolve('retreat');
                               decisionCollector.stop();
                          } else if (clicker) {
                               let pMora = Math.floor(clicker.loot.mora);
                               let pXp = Math.floor(clicker.loot.xp);
                               if (pMora > 0 || pXp > 0) {
                                    sql.prepare("UPDATE levels SET xp = xp + ?, mora = mora + ? WHERE user = ? AND guild = ?").run(pXp, pMora, clicker.id, guild.id);
                               }
                               players = players.filter(p => p.id !== clicker.id);
                               await i.reply({ content: `👋 **${clicker.name}** انسحب!`, ephemeral: false });
                               if (players.length === 0) { resolve('retreat'); decisionCollector.stop(); }
                          }
                       } else if (i.customId === 'dungeon_continue') {
                          if (i.user.id === hostId) {
                               await i.update({ content: `**يتقدم الفريق نحو الظلام !**`, components: [], embeds: [] });
                               resolve('continue');
                               decisionCollector.stop();
                          } else {
                               i.reply({ content: "فقط القائد يقرر.", ephemeral: true });
                          }
                       }
                 });

                 decisionCollector.on('end', (c, reason) => { if (reason !== 'user') resolve('retreat'); });
             });

             if (floorDecision === 'retreat') {
                 await sendEndMessage(mainChannel, threadChannel, players, floor, "retreat", sql, guild.id, hostId, activeDungeonRequests);
                 return;
             }
             
             players.forEach(p => { if(!p.isDead) p.hp = Math.min(p.hp + Math.floor(p.maxHp * 0.3), p.maxHp); });
        }
    }
}

async function sendEndMessage(mainChannel, thread, players, floor, status, sql, guildId, hostId, activeDungeonRequests) {
    let title = "", color = "", randomImage = null;

    if (status === 'win') {
        title = "❖ أسطـورة الدانـجون !";
        color = "#00FF00"; randomImage = WIN_IMAGES[0];
    } else if (status === 'retreat') {
        title = "❖ انـسـحـاب تـكـتيـكـي !";
        color = "#FFFF00"; randomImage = WIN_IMAGES[0];
    } else {
        title = "❖ هزيمـة ساحقـة ...";
        color = "#FF0000"; randomImage = LOSE_IMAGES[1];
    }

    let mvpPlayer = players.length > 0 ? players.reduce((prev, current) => (prev.totalDamage > current.totalDamage) ? prev : current) : null;
     
    const buffData = getDungeonBuff(floor);
    let buffText = "";
    const durationMs = buffData.minutes * 60 * 1000;
    const expire = Date.now() + durationMs;

    if ((status === 'win' || status === 'retreat') && buffData.percent > 0) {
        buffText = `- تـعـزيـز (+XP/Mora): +${buffData.percent}% (${buffData.minutes}د) ${EMOJI_BUFF}`;
        players.forEach(p => {
             sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guildId, p.id, buffData.percent, expire, 'xp', buffData.percent / 100);
             sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guildId, p.id, buffData.percent, expire, 'mora', buffData.percent / 100);
        });
    } else if (status === 'lose') {
        const nerfPercent = Math.min(10, Math.floor(floor / 2));
        buffText = `- لـعـنـة (-XP/Mora): -${nerfPercent}% (10د) ${EMOJI_NERF}`;
        const nerfExpire = Date.now() + (10 * 60 * 1000);
        players.forEach(p => {
             sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guildId, p.id, -nerfPercent, nerfExpire, 'xp', -nerfPercent / 100);
             sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guildId, p.id, -nerfPercent, nerfExpire, 'mora', -nerfPercent / 100);
        });
    }

    let lootString = "";
    players.forEach(p => {
        let finalMora = Math.floor(p.loot.mora);
        let finalXp = Math.floor(p.loot.xp);
        
        if (p.isDead) { finalMora = Math.floor(finalMora * 0.5); finalXp = Math.floor(finalXp * 0.5); }
        if (finalMora > 0 || finalXp > 0) sql.prepare("UPDATE levels SET xp = xp + ?, mora = mora + ? WHERE user = ? AND guild = ?").run(finalXp, finalMora, p.id, guildId);
          
        lootString += `✬ **${p.name}** ${p.isDead ? '(💀 نصف الغنائم)' : ''}: ${finalMora} ${EMOJI_MORA} | ${finalXp} XP\n`;
    });

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(`**الطابق الذي وصلتم له:** ${floor}\n\n**✶ تقـريـر المعـركـة:**\nMVP: ${mvpPlayer ? `<@${mvpPlayer.id}> (${mvpPlayer.totalDamage.toLocaleString()})` : 'N/A'}\n\n**✶ المكافآت:**\n${buffText}\n\n${lootString}`)
        .setColor(color)
        .setTimestamp();

    if (randomImage) embed.setImage(randomImage);
    const mentions = players.map(p => `<@${p.id}>`).join(' ');

    await mainChannel.send({ content: `✬ ${mentions}\n`, embeds: [embed] });
    
    if (activeDungeonRequests) activeDungeonRequests.delete(hostId);
      
    await thread.send({ content: `**✶ انتهت الرحلة، سيتم إغلاق البوابة...**` });
    setTimeout(async () => { try { await thread.delete(); } catch (err) {} }, 10000); 
}

module.exports = { runDungeon };
