const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, ComponentType } = require("discord.js");
const path = require('path');

// ==========================================
// ⚙️ إعدادات وتوابع
// ==========================================
const rootDir = process.cwd();
// تأكد من مسارات ملفات JSON
const weaponsConfig = require(path.join(rootDir, 'json', 'weapons-config.json'));
const skillsConfig = require(path.join(rootDir, 'json', 'skills-config.json'));

const BASE_HP = 800;       
const HP_PER_LEVEL = 60;   
const EMOJI_MORA = '<:mora:1435647151349698621>';

const KNIGHT_IMAGES = {
    MAIN: 'https://i.postimg.cc/d1ndBX7B/download.gif', 
    WIN: 'https://i.postimg.cc/xd8msjxk/escapar-a-toda-velocidad.gif', 
    LOSE: 'https://i.postimg.cc/d1ndBX7B/download.gif'
};

const activePveBattles = new Map();

// --- دوال مساعدة ---
function cleanDisplayName(name) {
    if (!name) return "لاعب";
    return name.replace(/<a?:.+?:\d+>/g, '').trim();
}

function buildHpBar(currentHp, maxHp) {
    currentHp = Math.max(0, currentHp);
    const percentage = (currentHp / maxHp) * 10;
    const filled = '█';
    const empty = '░';
    return `[${filled.repeat(Math.max(0, Math.floor(percentage))) + empty.repeat(Math.max(0, 10 - Math.floor(percentage)))}] ${currentHp}/${maxHp}`;
}

function buildEffectsString(effects) {
    let arr = [];
    if (effects.shield > 0) arr.push(`🛡️ (${effects.shield})`);
    if (effects.buff > 0) arr.push(`💪 (+${Math.round(effects.buff * 100)}%)`);
    if (effects.weaken > 0) arr.push(`📉 (-${Math.round(effects.weaken * 100)}%)`);
    if (effects.poison > 0) arr.push(`☠️ (${effects.poison})`);
    if (effects.burn > 0) arr.push(`🔥 (${effects.burn})`);
    if (effects.stun) arr.push(`⚡ (مشلول)`);
    if (effects.confusion) arr.push(`😵 (مرتبك)`);
    if (effects.evasion > 0) arr.push(`👻 (مراوغة)`);
    return arr.length > 0 ? arr.join(' | ') : 'لا يوجد';
}

function getUserRace(member, sql) {
    if (!member || !member.guild) return null;
    const allRaceRoles = sql.prepare("SELECT roleID, raceName FROM race_roles WHERE guildID = ?").all(member.guild.id);
    if (!member.roles || !member.roles.cache) return null;
    const userRoleIDs = member.roles.cache.map(r => r.id);
    return allRaceRoles.find(r => userRoleIDs.includes(r.roleID)) || null;
}

function getWeaponData(sql, member) {
    const userRace = getUserRace(member, sql);
    if (!userRace) return null;
    const weaponConfig = weaponsConfig.find(w => w.race === userRace.raceName);
    if (!weaponConfig) return null;
    let userWeapon = sql.prepare("SELECT * FROM user_weapons WHERE userID = ? AND guildID = ? AND raceName = ?").get(member.id, member.guild.id, userRace.raceName);
    if (!userWeapon || userWeapon.weaponLevel <= 0) return null;
    const damage = weaponConfig.base_damage + (weaponConfig.damage_increment * (userWeapon.weaponLevel - 1));
    return { ...weaponConfig, currentDamage: damage, currentLevel: userWeapon.weaponLevel };
}

function getAllSkillData(sql, member) {
    const userRace = getUserRace(member, sql);
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
    return skillsOutput;
}

function calculateDamage(attacker, defender, multiplier = 1) {
    let baseDmg = attacker.weapon ? attacker.weapon.currentDamage : 15;
    
    if (attacker.effects.buff > 0) baseDmg *= (1 + attacker.effects.buff);
    if (attacker.effects.weaken > 0) baseDmg *= (1 - attacker.effects.weaken);

    let finalDmg = Math.floor(baseDmg * multiplier);

    if (defender.effects.evasion > 0) return 0;

    if (defender.effects.shield > 0) {
        if (defender.effects.shield >= finalDmg) {
            defender.effects.shield -= finalDmg;
            finalDmg = 0;
        } else {
            finalDmg -= defender.effects.shield;
            defender.effects.shield = 0;
        }
    }

    if (defender.effects.rebound_active > 0) {
        const reflectedDmg = Math.floor(finalDmg * defender.effects.rebound_active);
        attacker.hp -= reflectedDmg;
        finalDmg -= reflectedDmg;
    }

    return Math.max(0, finalDmg);
}

function applyPersistentEffects(battleState, attackerId) {
    const attacker = battleState.players.get(attackerId);
    let logEntries = [];
    let skipTurn = false;

    const effectsList = ['buff', 'weaken', 'rebound_active', 'stun', 'confusion', 'evasion', 'blind'];
    effectsList.forEach(eff => {
        if (attacker.effects[eff + '_turns'] > 0) {
            attacker.effects[eff + '_turns']--;
            if (attacker.effects[eff + '_turns'] <= 0) {
                if (typeof attacker.effects[eff] === 'boolean') attacker.effects[eff] = false;
                else attacker.effects[eff] = 0;
            }
        }
    });

    if (attacker.effects.poison > 0) {
        attacker.hp -= attacker.effects.poison;
        logEntries.push(`☠️ ${attacker.isMonster ? attacker.name : cleanDisplayName(attacker.member.user.displayName)} يتألم من السم (-${attacker.effects.poison})!`);
        attacker.effects.poison_turns--;
        if (attacker.effects.poison_turns <= 0) attacker.effects.poison = 0;
    }

    if (attacker.effects.burn > 0) {
        attacker.hp -= attacker.effects.burn;
        logEntries.push(`🔥 ${attacker.isMonster ? attacker.name : cleanDisplayName(attacker.member.user.displayName)} يحترق (-${attacker.effects.burn})!`);
        attacker.effects.burn_turns--;
        if (attacker.effects.burn_turns <= 0) attacker.effects.burn = 0;
    }

    if (attacker.effects.stun) skipTurn = true;

    return { logEntries, skipTurn };
}

function applySkillEffect(battleState, attackerId, skill) {
    const cooldownDuration = skill.id.startsWith('race_') ? 5 : 3;
    if (!battleState.skillCooldowns[attackerId]) battleState.skillCooldowns[attackerId] = {};
    battleState.skillCooldowns[attackerId][skill.id] = cooldownDuration;

    const attacker = battleState.players.get(attackerId);
    // الخصم دائماً هو الآخر في قائمة الأدوار
    const defenderId = Array.from(battleState.players.keys()).find(id => id !== attackerId);
    const defender = battleState.players.get(defenderId);

    const effectValue = skill.effectValue;
    const statType = skill.stat_type;

    let baseAtk = attacker.weapon ? attacker.weapon.currentDamage : 15;
    if (attacker.effects.buff > 0) baseAtk *= (1 + attacker.effects.buff);
    if (attacker.effects.weaken > 0) baseAtk *= (1 - attacker.effects.weaken);

    switch (statType) {
        case 'Cleanse_Buff_Shield':
            attacker.effects.shield += Math.floor(attacker.maxHp * 0.25);
            attacker.effects.buff = 0.2; attacker.effects.buff_turns = 2;
            return `🛡️ **${cleanDisplayName(attacker.member.user.displayName)}** استخدم درعاً وتطهير!`;
        case 'Stun_Vulnerable':
            const dmg = Math.floor(baseAtk * 1.1);
            defender.hp -= dmg;
            defender.effects.stun = true; defender.effects.stun_turns = 1;
            return `⚡ **${cleanDisplayName(attacker.member.user.displayName)}** شل حركة الفارس!`;
        default:
            const d = calculateDamage(attacker, defender, skill.stat_type === '%' ? 1.5 : 1);
            defender.hp -= d;
            return `💥 **${cleanDisplayName(attacker.member.user.displayName)}** استخدم ${skill.name} وسبب ${d} ضرر!`;
    }
}

function buildBattleEmbed(battleState, skillSelectionMode = false, skillPage = 0) {
    const [attackerId, defenderId] = battleState.turn;
    const attacker = battleState.players.get(attackerId);
    const defender = battleState.players.get(defenderId);
    
    const embed = new EmbedBuilder()
        .setTitle('⚔️ مبارزة الموت: ضد فارس الإمبراطور')
        .setColor(Colors.DarkRed)
        .setImage(KNIGHT_IMAGES.MAIN);

    embed.addFields(
        { 
            name: `${attacker.isMonster ? attacker.name : cleanDisplayName(attacker.member.user.displayName)}`, 
            value: `HP: ${buildHpBar(attacker.hp, attacker.maxHp)}\nتأثيرات: ${buildEffectsString(attacker.effects)}`, 
            inline: true 
        },
        { 
            name: `${defender.isMonster ? defender.name : cleanDisplayName(defender.member.user.displayName)}`, 
            value: `HP: ${buildHpBar(defender.hp, defender.maxHp)}\nتأثيرات: ${buildEffectsString(defender.effects)}`, 
            inline: true 
        }
    );

    embed.setDescription(`🚨 **حالة الطوارئ!**\nفارس الإمبراطور يغلق المنافذ!\nالدور الآن لـ: **${attacker.isMonster ? attacker.name : attacker.member}**`);

    if (battleState.log.length > 0) {
        embed.addFields({ name: "📝 سجل المعركة:", value: battleState.log.slice(-3).join('\n'), inline: false });
    }

    // إذا كان دور الوحش (الفارس) أو المعركة قيد المعالجة، لا نظهر أزرار
    if (attacker.isMonster || battleState.processingTurn) {
        return { embeds: [embed], components: [] };
    }

    if (skillSelectionMode) {
        const userSkills = attacker.skills || {};
        const availableSkills = Object.values(userSkills).filter(s => s.currentLevel > 0 || s.id.startsWith('race_'));
        const skillsPerPage = 4;
        const totalPages = Math.ceil(availableSkills.length / skillsPerPage);
        page = Math.max(0, Math.min(skillPage, totalPages - 1));
        battleState.skillPage = page;

        const skillsToShow = availableSkills.slice(page * skillsPerPage, (page * skillsPerPage) + skillsPerPage);
        const skillButtons = new ActionRowBuilder();
        const cooldowns = battleState.skillCooldowns[attackerId] || {};

        skillsToShow.forEach(skill => {
            let emoji = skill.emoji || '✨';
            const isOnCooldown = (cooldowns[skill.id] || 0) > 0;
            const label = isOnCooldown ? `${skill.name} (${cooldowns[skill.id]})` : skill.name;
            
            skillButtons.addComponents(new ButtonBuilder()
                .setCustomId(`pvp_skill_use_${skill.id}`)
                .setLabel(label)
                .setEmoji(emoji)
                .setStyle(isOnCooldown ? ButtonStyle.Secondary : ButtonStyle.Primary)
                .setDisabled(isOnCooldown)
            );
        });

        const navRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('pvp_skill_back').setLabel('العودة').setStyle(ButtonStyle.Danger));
        if (totalPages > 1) {
            navRow.addComponents(
                new ButtonBuilder().setCustomId(`pvp_skill_page_${page - 1}`).setLabel('▶️').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
                new ButtonBuilder().setCustomId(`pvp_skill_page_${page + 1}`).setLabel('▶️').setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages - 1)
            );
        }
        return { embeds: [embed], components: [skillButtons, navRow] };
    }

    const mainButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('pvp_action_attack').setLabel('هـجـوم').setStyle(ButtonStyle.Danger).setEmoji('⚔️'),
        new ButtonBuilder().setCustomId('pvp_action_skill').setLabel('مـهــارات').setStyle(ButtonStyle.Primary).setEmoji('✨')
    );
    return { embeds: [embed], components: [mainButtons] };
}

// =================================================================
// 🔥🔥🔥 إعداد المستمع (Collector) للأزرار 🔥🔥🔥
// =================================================================
function setupBattleCollector(battleState, interaction) {
    const robberId = battleState.turn[0]; 
    
    // فلتر للتأكد أن السارق فقط من يضغط الأزرار
    const filter = i => i.user.id === robberId && i.customId.startsWith('pvp_');
    
    const collector = battleState.message.createMessageComponentCollector({ 
        filter, 
        componentType: ComponentType.Button, 
        time: 300000 
    });

    collector.on('collect', async i => {
        // إذا كان البوت يعالج دوراً حالياً، تجاهل الضغطات
        if (battleState.processingTurn) {
             return i.reply({ content: "⏳ انتظر دورك!", ephemeral: true });
        }

        const customId = i.customId;
        const player = battleState.players.get(i.user.id);
        const guard = battleState.players.get("guard");

        // 1. هجوم عادي
        if (customId === 'pvp_action_attack') {
            battleState.processingTurn = true; // قفل التفاعل

            const dmg = calculateDamage(player, guard);
            guard.hp -= dmg;
            battleState.log.push(`⚔️ **${cleanDisplayName(player.member.user.displayName)}** هاجم الفارس وسبب **${dmg}** ضرر!`);
            
            // 🛑 تحديث الدور يدوياً إلى الفارس لإخفاء الأزرار فوراً
            battleState.turn = ["guard", player.member.id];
            
            // تحديث الرسالة (سيتم إخفاء الأزرار لأن الدور للفارس)
            await i.update(buildBattleEmbed(battleState));

            // تشغيل دور الفارس
            await processGuardTurn(battleState);
        } 
        // 2. فتح قائمة المهارات
        else if (customId === 'pvp_action_skill') {
            await i.update(buildBattleEmbed(battleState, true, 0));
        } 
        // 3. العودة
        else if (customId === 'pvp_skill_back') {
            await i.update(buildBattleEmbed(battleState, false));
        } 
        // 4. صفحات المهارات
        else if (customId.startsWith('pvp_skill_page_')) {
            const newPage = parseInt(customId.split('_')[3]);
            await i.update(buildBattleEmbed(battleState, true, newPage));
        } 
        // 5. استخدام مهارة
        else if (customId.startsWith('pvp_skill_use_')) {
            battleState.processingTurn = true; // قفل التفاعل

            const skillId = customId.replace('pvp_skill_use_', '');
            const skillData = player.skills[skillId];
            
            if (skillData) {
                const logMsg = applySkillEffect(battleState, i.user.id, skillData);
                battleState.log.push(logMsg);
                
                // 🛑 تحديث الدور يدوياً إلى الفارس لإخفاء الأزرار
                battleState.turn = ["guard", player.member.id];

                await i.update(buildBattleEmbed(battleState));
                await processGuardTurn(battleState);
            }
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            handleGuardBattleEnd(battleState, "guard", "lose");
        }
    });
}

// =================================================================
// 🛡️ بدء المعركة
// =================================================================
async function startGuardBattle(interaction, client, sql, robberMember, amountToSteal) {
    const getLevel = client.getLevel;
    let robberData = getLevel.get(robberMember.id, interaction.guild.id) || { ...client.defaultData, user: robberMember.id, guild: interaction.guild.id };
    
    const pMaxHp = BASE_HP + (robberData.level * HP_PER_LEVEL);
    let robberWeapon = getWeaponData(sql, robberMember);
    if (!robberWeapon || robberWeapon.currentLevel === 0) {
        robberWeapon = { name: "قبضة يد", currentDamage: 15 };
    }
    const robberSkills = getAllSkillData(sql, robberMember);

    const guardMaxHp = pMaxHp; 
    const guardWeapon = { 
        name: "نصل الإمبراطور", 
        currentDamage: Math.floor(robberWeapon.currentDamage * 1.1) 
    };

    const defEffects = () => ({ 
        shield: 0, buff: 0, buff_turns: 0, weaken: 0, weaken_turns: 0, 
        poison: 0, poison_turns: 0, burn: 0, burn_turns: 0, 
        rebound_active: 0, rebound_turns: 0, stun: false, stun_turns: 0, 
        confusion: false, confusion_turns: 0, evasion: 0, evasion_turns: 0, 
        blind: 0, blind_turns: 0 
    });

    const battleState = {
        isPvE: true,
        isGuardBattle: true, 
        amountToSteal: amountToSteal,
        message: null, 
        turn: [robberMember.id, "guard"], 
        processingTurn: false, // للتحكم في الأزرار
        log: [`🛡️ **فارس الإمبراطور** يغلق الأبواب! "لن تخرج من هنا حياً!"`], 
        skillPage: 0, 
        skillCooldowns: { [robberMember.id]: {}, "guard": {} },
        players: new Map([
            [robberMember.id, { 
                isMonster: false, 
                member: robberMember, 
                hp: pMaxHp, 
                maxHp: pMaxHp, 
                weapon: robberWeapon, 
                skills: robberSkills, 
                effects: defEffects() 
            }],
            ["guard", { 
                isMonster: true, 
                name: "فارس الإمبراطور", 
                hp: guardMaxHp, 
                maxHp: guardMaxHp, 
                weapon: guardWeapon, 
                skills: {}, 
                effects: defEffects() 
            }]
        ])
    };

    activePveBattles.set(interaction.channel.id, battleState);
    
    const { embeds: battleEmbeds, components } = buildBattleEmbed(battleState);
    
    try {
        const msgPayload = { 
            content: `🚨 **كشف التسلل!** <@${robberMember.id}>`, 
            embeds: battleEmbeds, 
            components: components 
        };

        let sentMsg;
        if (interaction.isRepliable && !interaction.replied) {
            sentMsg = await interaction.reply({ ...msgPayload, fetchReply: true });
        } else {
            sentMsg = await interaction.channel.send(msgPayload);
        }
        
        battleState.message = sentMsg;
        setupBattleCollector(battleState, interaction);
        
    } catch (error) {
        console.error("Error starting knight battle:", error);
        activePveBattles.delete(interaction.channel.id);
    }
}

// =================================================================
// 🧠 ذكاء الفارس (AI)
// =================================================================
async function processGuardTurn(battleState) {
    const guard = battleState.players.get("guard");
    // العثور على اللاعب بشكل آمن
    const playerMemberId = Array.from(battleState.players.keys()).find(id => id !== "guard");
    const player = battleState.players.get(playerMemberId);

    // 1. تقليل الكولداون
    const playerCooldowns = battleState.skillCooldowns[playerMemberId];
    if (playerCooldowns) {
        for (const skillId in playerCooldowns) {
            if (playerCooldowns[skillId] > 0) playerCooldowns[skillId]--;
        }
    }

    // 2. تطبيق تأثيرات السم/الحرق على الفارس
    const { logEntries, skipTurn } = applyPersistentEffects(battleState, "guard");
    if (logEntries.length > 0) battleState.log.push(...logEntries);

    // 3. التحقق من موت الفارس
    if (guard.hp <= 0) {
        battleState.processingTurn = false;
        return await handleGuardBattleEnd(battleState, playerMemberId, "win");
    }

    // تحديث الرسالة بتأثيرات البداية
    // (لاحظ أننا لم نغير الدور، لذا ستبقى الأزرار مخفية)
    const { embeds: tempEmbeds } = buildBattleEmbed(battleState);
    await battleState.message.edit({ embeds: tempEmbeds, components: [] });

    // 4. إذا كان الفارس مشلولاً
    if (skipTurn) {
        battleState.log.push(`💤 **فارس الإمبراطور** مشلول ولا يستطيع الحركة!`);
        battleState.turn = [playerMemberId, "guard"]; // إعادة الدور للاعب
        battleState.processingTurn = false; // فتح الأزرار
        
        const { embeds, components } = buildBattleEmbed(battleState);
        await battleState.message.edit({ embeds: embeds, components });
        return;
    }

    // تأخير "التفكير"
    await new Promise(r => setTimeout(r, 1500)); 

    // 5. منطق الذكاء (AI)
    let actionLog = "";
    const baseDmg = guard.weapon.currentDamage;
    
    if (guard.hp < guard.maxHp * 0.30 && Math.random() < 0.7) {
        const healAmount = Math.floor(guard.maxHp * 0.25);
        guard.hp = Math.min(guard.maxHp, guard.hp + healAmount);
        guard.effects.shield += Math.floor(guard.maxHp * 0.1);
        actionLog = `💖 **فارس الإمبراطور** شرب جرعة إمبراطورية واستعاد ${healAmount} HP!`;
    } else if (player.hp < player.maxHp * 0.25 && Math.random() < 0.8) {
        const dmg = calculateDamage(guard, player, 1.5);
        player.hp -= dmg;
        actionLog = `💀 **فارس الإمبراطور** استخدم "إعدام الخائن"! سبب **${dmg}** ضرر قاتل!`;
    } else if (player.effects.shield > 0 && Math.random() < 0.6) {
        const dmg = calculateDamage(guard, player, 0.8);
        player.effects.shield = 0;
        player.hp -= dmg;
        actionLog = `🔨 **فارس الإمبراطور** حطم درعك بضربة ثقيلة وسبب ${dmg} ضرر!`;
    } else {
        const roll = Math.random();
        if (roll < 0.25) { 
            const dmg = calculateDamage(guard, player, 0.9);
            player.hp -= dmg;
            player.effects.stun = true; player.effects.stun_turns = 1;
            actionLog = `⚡ **فارس الإمبراطور** ضربك بمقبض سيفه! أنت **مشلول** للدور القادم!`;
        } else if (roll < 0.50) {
            const dmg = calculateDamage(guard, player, 1.1);
            player.hp -= dmg;
            player.effects.burn = Math.floor(baseDmg * 0.2); player.effects.burn_turns = 3;
            actionLog = `🩸 **فارس الإمبراطور** أصابك بجرح عميق (نزيف)!`;
        } else {
            const dmg = calculateDamage(guard, player, 1.0);
            player.hp -= dmg;
            actionLog = `⚔️ **فارس الإمبراطور** هاجمك بمهارة سيفه وسبب **${dmg}** ضرر!`;
        }
    }

    battleState.log.push(actionLog);

    // 6. التحقق من موت اللاعب
    if (player.hp <= 0) {
        battleState.processingTurn = false;
        return await handleGuardBattleEnd(battleState, "guard", "lose");
    }

    // 7. إعادة الدور للاعب وإظهار الأزرار
    battleState.turn = [playerMemberId, "guard"];
    battleState.processingTurn = false; // فتح الأزرار
    const { embeds: updateEmbeds, components: updateComponents } = buildBattleEmbed(battleState);
    await battleState.message.edit({ embeds: updateEmbeds, components: updateComponents });
}

// =================================================================
// 🏁 نهاية المعركة
// =================================================================
async function handleGuardBattleEnd(battleState, winnerId, resultType) {
    const client = battleState.message.client;
    // استخراج بيانات اللاعب بشكل آمن
    const playerMemberId = Array.from(battleState.players.keys()).find(id => id !== "guard");
    const player = battleState.players.get(playerMemberId);
    
    const setScore = client.setLevel;
    const getScore = client.getLevel;
    
    let playerData = getScore.get(player.member.id, battleState.message.guild.id);
    const amount = battleState.amountToSteal;

    const embed = new EmbedBuilder();
    activePveBattles.delete(battleState.message.channel.id);

    await battleState.message.edit({ components: [] }).catch(() => {});

    if (resultType === "win") {
        playerData.mora += amount;
        setScore.run(playerData);

        embed.setTitle(`🏆 هــروب نــاجــح!`)
             .setColor(Colors.Green)
             .setDescription(`تمكنت من هزيمة فارس الإمبراطور والفرار بالغنيمة!\n\n💰 **المبلغ المسروق:** ${amount.toLocaleString()} ${EMOJI_MORA}`)
             .setImage(KNIGHT_IMAGES.WIN);
    } else {
        if (playerData.mora >= amount) {
            playerData.mora -= amount;
        } else {
            const remaining = amount - playerData.mora;
            playerData.mora = 0;
            playerData.bank = Math.max(0, playerData.bank - remaining);
        }
        setScore.run(playerData);

        embed.setTitle(`💀 تـم الـقـبـض عـلـيـك!`)
             .setColor(Colors.DarkRed)
             .setDescription(`سقطت أمام قوة فارس الإمبراطور...\n\n💸 **الغرامة المدفوعة:** ${amount.toLocaleString()} ${EMOJI_MORA}\n🤕 لقد تم تجريدك من الغنيمة ورميك خارج القلعة!`)
             .setImage(KNIGHT_IMAGES.LOSE);
    }

    await battleState.message.channel.send({ content: `<@${player.member.id}>`, embeds: [embed] });
}

module.exports = { startGuardBattle, processGuardTurn, activePveBattles };
