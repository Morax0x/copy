const { SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const Canvas = require('canvas');
const path = require('path');

// ❌ تم حذف كود تحميل الخطوط لتفادي التعارض وتسريع البوت ❌

// ✅✅ إعدادات النظام ✅✅
const TEST_MODE = false; 
const CHILDREN_PER_PAGE = 4;

// الألوان
const THEME = {
    BG_TOP: "#14161f",    
    BG_BOT: "#0a0b10",    
    GRID: "rgba(255, 255, 255, 0.03)", 
    MALE: "#00a8ff",
    FEMALE: "#ff0055",
    DEFAULT: "#00ff88",
    GOLD: "#ffd700",
    LINE: "#cfd8dc",      
    TEXT: "#ffffff",
    NAME_BG: "rgba(0, 0, 0, 0.85)" 
};

// الأبعاد (تم التعديل لتناسب 4 أجيال)
const DIMS = {
    NODE: 80,      // حجم صورة الشخص الأساسي
    PARTNER: 65,   // حجم صورة الزوجة
    KID: 60,       // حجم صورة الابن
    GRAND: 45,     // حجم صورة الحفيد
    PARENT: 60,    // حجم صورة الأب/الأم (الجديد)
    LEVEL_GAP: 220, // المسافة بين كل جيل وجيل
    SIB_GAP: 40,
};

// دالة مساعدة: جلب لون العضو
async function getUserColor(client, userId, guild) {
    if (TEST_MODE) return THEME.DEFAULT;
    try {
        const sql = client.sql;
        const config = sql.prepare("SELECT * FROM family_config WHERE guildID = ?").get(guild.id);
        if (!config) return THEME.DEFAULT;
        
        let member = guild.members.cache.get(userId);
        if (!member) member = await guild.members.fetch(userId).catch(() => null);
        if (!member) return THEME.DEFAULT;
        
        const checkRole = (rolesData) => {
            if (!rolesData) return false;
            try {
                const roleIds = JSON.parse(rolesData);
                if (Array.isArray(roleIds)) return roleIds.some(id => member.roles.cache.has(id));
            } catch {
                return member.roles.cache.has(rolesData);
            }
            return false;
        };

        if (checkRole(config.maleRole)) return THEME.MALE;
        if (checkRole(config.femaleRole)) return THEME.FEMALE;
        return THEME.DEFAULT;
    } catch { return THEME.DEFAULT; }
}

// ==========================================
// 🎨 المحرك الرسومي
// ==========================================
async function drawTreePage(treeData, pageIndex) {
    const start = pageIndex * CHILDREN_PER_PAGE;
    const end = start + CHILDREN_PER_PAGE;
    const currentChildren = treeData.children.slice(start, end);

    let childBlocks = [];
    let totalWidth = 0;

    // حساب العرض المطلوب للأبناء
    for (let child of currentChildren) {
        const spouseW = (child.partners.length * (DIMS.PARTNER * 2 + 10));
        const topW = (DIMS.KID * 2) + spouseW;
        const grandCount = child.offspring.length;
        const botW = grandCount * (DIMS.GRAND * 2 + 10);
        const blockW = Math.max(topW, botW, DIMS.KID * 3);
        
        childBlocks.push({ data: child, width: blockW, spouseW: spouseW });
        totalWidth += blockW + DIMS.SIB_GAP;
    }

    // حساب عرض الآباء (الجيل الأول)
    const parentsWidth = (treeData.parents.length * (DIMS.PARENT * 2 + 20));

    const minWidth = 1000;
    const partnersWidth = (treeData.partners.length * (DIMS.PARTNER * 2 + 20)) + (DIMS.NODE * 2);
    
    // العرض النهائي للكانفاس بناءً على الأعرض (الآباء أو الأبناء أو الشركاء)
    const canvasWidth = Math.max(totalWidth, partnersWidth, parentsWidth, minWidth) + 100;
    const canvasHeight = 1000; // زيادة الطول لاستيعاب الآباء
    const centerX = canvasWidth / 2;

    const canvas = Canvas.createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    // الخلفية
    const grad = ctx.createLinearGradient(0, 0, 0, canvasHeight);
    grad.addColorStop(0, THEME.BG_TOP);
    grad.addColorStop(1, THEME.BG_BOT);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // الشبكة
    ctx.lineWidth = 1;
    ctx.strokeStyle = THEME.GRID;
    const gridSize = 50;
    for(let x=0; x<canvasWidth; x+=gridSize) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvasHeight); ctx.stroke(); }
    for(let y=0; y<canvasHeight; y+=gridSize) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvasWidth,y); ctx.stroke(); }

    // تأثير Vignette
    const radGrad = ctx.createRadialGradient(centerX, canvasHeight/2, 100, centerX, canvasHeight/2, canvasWidth);
    radGrad.addColorStop(0, "rgba(0,0,0,0)");
    radGrad.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = radGrad;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // --- دوال الرسم ---
    function drawNameLabel(name, x, y, color) {
        const fontSize = 18;
        // استخدام الخطوط الافتراضية لتجنب المشاكل
        ctx.font = `bold ${fontSize}px "Sans", "Arial"`; 
        const textMetrics = ctx.measureText(name);
        const textWidth = textMetrics.width;
        const boxWidth = textWidth + 20;
        const boxHeight = 35;
        const boxX = x - (boxWidth / 2);
        const boxY = y + 15;

        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 5;
        ctx.fillStyle = THEME.NAME_BG;
        ctx.beginPath();
        if(ctx.roundRect) ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 10);
        else ctx.rect(boxX, boxY, boxWidth, boxHeight); // Fallback if roundRect not supported
        ctx.fill();
        
        ctx.shadowBlur = 0;
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        ctx.stroke();

        ctx.fillStyle = THEME.TEXT;
        ctx.textAlign = "center";
        ctx.fillText(name, x, boxY + 24);
    }

    async function drawCircleImg(user, x, y, radius, isMain=false) {
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.6)";
        ctx.shadowBlur = 20;
        ctx.shadowOffsetY = 8;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        try {
            let url;
            // 🔥 تسريع التحميل: طلب صورة صغيرة الحجم
            if (typeof user.displayAvatarURL === 'function') {
                url = user.displayAvatarURL({ extension: 'png', size: 128 });
            } else {
                url = user.displayAvatarURL; 
            }
            const img = await Canvas.loadImage(url);
            ctx.drawImage(img, x - radius, y - radius, radius * 2, radius * 2);
        } catch (err) {
            ctx.fillStyle = "#2c3e50";
            ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        }
        ctx.restore();

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.lineWidth = isMain ? 6 : 4;
        ctx.strokeStyle = isMain ? THEME.GOLD : (user.color || THEME.DEFAULT);
        ctx.stroke();

        const name = user.username || user.displayName || "???";
        const shortName = name.length > 12 ? name.substring(0, 10)+".." : name;
        drawNameLabel(shortName, x, y + radius, isMain ? THEME.GOLD : (user.color || THEME.DEFAULT));
    }

    function drawElbowLine(x1, y1, x2, y2, color=THEME.LINE) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        const midY = (y1 + y2) / 2;
        ctx.lineTo(x1, midY); 
        ctx.lineTo(x2, midY); 
        ctx.lineTo(x2, y2);   
        ctx.lineWidth = 3;
        ctx.strokeStyle = color;
        ctx.shadowColor = "rgba(0,0,0,0.8)";
        ctx.shadowBlur = 2;
        ctx.stroke();
        ctx.restore();
    }

    function drawHorizontalLine(x1, y, x2, color=THEME.LINE) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y);
        ctx.lineWidth = 3;
        ctx.strokeStyle = color;
        ctx.shadowColor = "rgba(0,0,0,0.8)";
        ctx.shadowBlur = 2;
        ctx.stroke();
        ctx.restore();
    }

    // ==========================================
    // 🖌️ الإحداثيات والطبقات
    // ==========================================

    const Y_PARENTS = 80;  // الجيل 1: الآباء
    const Y_MAIN = 320;    // الجيل 2: أنت والزوجات
    const Y_KIDS = 560;    // الجيل 3: الأبناء
    const Y_GRAND = 800;   // الجيل 4: الأحفاد

    // 1. رسم خطوط الآباء (من الأعلى للأسفل)
    if (treeData.parents.length > 0) {
        // حساب مركز الآباء
        const pTotalW = treeData.parents.length * (DIMS.PARENT * 2 + 40);
        let currentPX = centerX - (pTotalW / 2) + DIMS.PARENT + 20;
        
        for(let i=0; i<treeData.parents.length; i++) {
            // رسم خط من الأب إلى المستخدم الرئيسي
            drawElbowLine(currentPX, Y_PARENTS + DIMS.PARENT, centerX, Y_MAIN - DIMS.NODE);
            currentPX += DIMS.PARENT * 2 + 40;
        }
    }

    // 2. خطوط الزوجات
    let leftP = [], rightP = [];
    treeData.partners.forEach((p, i) => (i%2===0 ? rightP : leftP).push(p));

    let pX = centerX + DIMS.NODE + 40;
    for(const p of rightP) {
        pX += DIMS.PARTNER;
        drawHorizontalLine(centerX + DIMS.NODE, Y_MAIN, pX - DIMS.PARTNER, THEME.FEMALE);
        pX += DIMS.PARTNER + 20;
    }
    pX = centerX - DIMS.NODE - 40;
    for(const p of leftP) {
        pX -= DIMS.PARTNER;
        drawHorizontalLine(centerX - DIMS.NODE, Y_MAIN, pX + DIMS.PARTNER, THEME.FEMALE);
        pX -= DIMS.PARTNER - 20;
    }

    // 3. خطوط الأبناء والأحفاد
    if (childBlocks.length > 0) {
        drawElbowLine(centerX, Y_MAIN + DIMS.NODE, centerX, Y_KIDS - DIMS.KID - 40);
        let currentX = centerX - (totalWidth / 2);
        
        for(const block of childBlocks) {
            const blockCenter = currentX + (block.width / 2);
            const kidRealX = blockCenter - (block.spouseW / 2);

            drawElbowLine(centerX, Y_MAIN + DIMS.NODE, kidRealX, Y_KIDS - DIMS.KID);
            
            let spX = kidRealX + DIMS.KID + 20;
            let lastSpouseX = kidRealX;
            if (block.data.partners && block.data.partners.length > 0) {
                for (const sp of block.data.partners) {
                    spX += DIMS.PARTNER;
                    drawHorizontalLine(kidRealX, Y_KIDS, spX, THEME.FEMALE);
                    lastSpouseX = spX;
                    spX += DIMS.PARTNER + 10;
                }
            }

            let parentsCenterX = (kidRealX + lastSpouseX) / 2;
            if (block.data.offspring.length > 0) {
                const grandCount = block.data.offspring.length;
                const grandTotalW = grandCount * (DIMS.GRAND * 2 + 10);
                let grandX = blockCenter - (grandTotalW / 2) + DIMS.GRAND;

                const linkYStart = Y_KIDS + (block.data.partners.length > 0 ? 0 : DIMS.KID); 
                const linkYEnd = Y_GRAND - DIMS.GRAND;

                for (const grand of block.data.offspring) {
                    drawElbowLine(parentsCenterX, linkYStart, grandX, linkYEnd);
                    grandX += DIMS.GRAND * 2 + 10;
                }
            }
            currentX += block.width + DIMS.SIB_GAP;
        }
    }

    // ==========================================
    // 🖼️ رسم الصور
    // ==========================================

    // 0. الآباء (الجيل الأول)
    if (treeData.parents.length > 0) {
        const pTotalW = treeData.parents.length * (DIMS.PARENT * 2 + 40);
        let currentPX = centerX - (pTotalW / 2) + DIMS.PARENT + 20;
        
        for(const parent of treeData.parents) {
            await drawCircleImg(parent, currentPX, Y_PARENTS, DIMS.PARENT);
            currentPX += DIMS.PARENT * 2 + 40;
        }
    }

    // 1. المستخدم الرئيسي (الجيل الثاني)
    await drawCircleImg(treeData.main, centerX, Y_MAIN, DIMS.NODE, true);

    // 2. الزوجات
    pX = centerX + DIMS.NODE + 40;
    for(const p of rightP) {
        pX += DIMS.PARTNER;
        await drawCircleImg(p, pX, Y_MAIN, DIMS.PARTNER);
        pX += DIMS.PARTNER + 20;
    }
    pX = centerX - DIMS.NODE - 40;
    for(const p of leftP) {
        pX -= DIMS.PARTNER;
        await drawCircleImg(p, pX, Y_MAIN, DIMS.PARTNER);
        pX -= DIMS.PARTNER - 20;
    }

    // 3. الأبناء (الجيل الثالث)
    let currentX = centerX - (totalWidth / 2);
    for(const block of childBlocks) {
        const blockCenter = currentX + (block.width / 2);
        const kidRealX = blockCenter - (block.spouseW / 2);

        await drawCircleImg(block.data, kidRealX, Y_KIDS, DIMS.KID);

        let spX = kidRealX + DIMS.KID + 20;
        if (block.data.partners) {
            for (const sp of block.data.partners) {
                spX += DIMS.PARTNER;
                await drawCircleImg(sp, spX, Y_KIDS, DIMS.PARTNER);
                spX += DIMS.PARTNER + 10;
            }
        }

        // 4. الأحفاد (الجيل الرابع)
        if (block.data.offspring.length > 0) {
            const grandCount = block.data.offspring.length;
            const grandTotalW = grandCount * (DIMS.GRAND * 2 + 10);
            let grandX = blockCenter - (grandTotalW / 2) + DIMS.GRAND;

            for (const grand of block.data.offspring) {
                await drawCircleImg(grand, grandX, Y_GRAND, DIMS.GRAND);
                grandX += DIMS.GRAND * 2 + 10;
            }
        }
        currentX += block.width + DIMS.SIB_GAP;
    }

    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = '20px "Sans", "Arial"';
    ctx.fillText(`الصفحة ${pageIndex + 1}`, canvasWidth - 80, canvasHeight - 30);

    return new AttachmentBuilder(canvas.toBuffer(), { name: 'family-tree.png' });
}

module.exports = {
    name: 'tree',
    description: 'عرض شجرة العائلة',
    aliases: ['شجرة', 'family'],
    
    async execute(message, args) {
        const user = message.author;
        const client = message.client;
        const guild = message.guild;

        const targetMember = message.mentions.members.first() || 
                             message.guild.members.cache.get(args[0]) || 
                             message.member;
                             
        const targetUser = targetMember.user;

        let treeData = {
            main: { 
                username: targetUser.username, 
                color: THEME.GOLD, 
                id: targetUser.id, 
                displayAvatarURL: () => targetUser.displayAvatarURL({ extension: 'png' }) 
            },
            partners: [],
            children: [],
            parents: [] // إضافة خانة الآباء
        };

        if (TEST_MODE) {
            // (محذوف للاختصار)
        } else {
            const sql = client.sql;
            treeData.main.color = await getUserColor(client, targetUser.id, guild);
            
            // 1. جلب الآباء (الجيل الأول)
            const parentRows = sql.prepare("SELECT parentID FROM children WHERE childID = ? AND guildID = ?").all(targetUser.id, guild.id);
            for (const row of parentRows) {
                try {
                    let parentUser = guild.members.cache.get(row.parentID);
                    if (!parentUser) parentUser = await client.users.fetch(row.parentID).catch(() => null);
                    if (!parentUser) continue;

                    const pColor = await getUserColor(client, parentUser.id, guild);
                    treeData.parents.push({
                        username: parentUser.user ? parentUser.user.username : parentUser.username,
                        id: parentUser.id,
                        color: pColor,
                        displayAvatarURL: () => parentUser.displayAvatarURL({ extension: 'png' })
                    });
                } catch {}
            }

            // 2. جلب الزوجات (الجيل الثاني - شركاء)
            const marriages = sql.prepare("SELECT partnerID FROM marriages WHERE userID = ? AND guildID = ?").all(targetUser.id, guild.id);
            for (const m of marriages) {
                try {
                    let pUser = guild.members.cache.get(m.partnerID);
                    if (!pUser) pUser = await client.users.fetch(m.partnerID).catch(() => null);
                    if (!pUser) continue;

                    const color = await getUserColor(client, pUser.id, guild);
                    treeData.partners.push({ 
                        username: pUser.user ? pUser.user.username : pUser.username,
                        id: pUser.id,
                        color: color,
                        displayAvatarURL: () => pUser.displayAvatarURL({ extension: 'png' })
                    });
                } catch {}
            }

            // 3. جلب الأبناء (الجيل الثالث) - بحث ذكي
            let childrenRows = sql.prepare("SELECT childID FROM children WHERE parentID = ? AND guildID = ?").all(targetUser.id, guild.id);
            for (const p of treeData.partners) {
                const stepRows = sql.prepare("SELECT childID FROM children WHERE parentID = ? AND guildID = ?").all(p.id, guild.id);
                for (const row of stepRows) {
                    if (!childrenRows.find(c => c.childID === row.childID)) childrenRows.push(row);
                }
            }

            for (const row of childrenRows) {
                try {
                    let cUser = guild.members.cache.get(row.childID);
                    if (!cUser) cUser = await client.users.fetch(row.childID).catch(() => null);
                    if (!cUser) continue;

                    const cColor = await getUserColor(client, cUser.id, guild);
                    let cPartners = [];
                    
                    // زوجات الابن
                    const cMarriages = sql.prepare("SELECT partnerID FROM marriages WHERE userID = ? AND guildID = ?").all(cUser.id, guild.id);
                    for (const cm of cMarriages) {
                        try {
                            let cpUser = guild.members.cache.get(cm.partnerID);
                            if (!cpUser) cpUser = await client.users.fetch(cm.partnerID).catch(() => null);
                            if (!cpUser) continue;
                            const cpColor = await getUserColor(client, cpUser.id, guild);
                            cPartners.push({ 
                                username: cpUser.user ? cpUser.user.username : cpUser.username,
                                id: cpUser.id,
                                color: cpColor,
                                displayAvatarURL: () => cpUser.displayAvatarURL({ extension: 'png' })
                            });
                        } catch {}
                    }

                    // 4. الأحفاد (الجيل الرابع)
                    let grandChildren = [];
                    let grandRows = sql.prepare("SELECT childID FROM children WHERE parentID = ? AND guildID = ?").all(cUser.id, guild.id);
                    for(const cp of cPartners) {
                        const stepGrandRows = sql.prepare("SELECT childID FROM children WHERE parentID = ? AND guildID = ?").all(cp.id, guild.id);
                        for (const sRow of stepGrandRows) {
                            if (!grandRows.find(g => g.childID === sRow.childID)) grandRows.push(sRow);
                        }
                    }

                    for (const gRow of grandRows) {
                        try {
                            let gUser = guild.members.cache.get(gRow.childID);
                            if (!gUser) gUser = await client.users.fetch(gRow.childID).catch(() => null);
                            if (!gUser) continue;
                            const gColor = await getUserColor(client, gUser.id, guild);
                            grandChildren.push({ 
                                username: gUser.user ? gUser.user.username : gUser.username,
                                id: gUser.id,
                                color: gColor,
                                displayAvatarURL: () => gUser.displayAvatarURL({ extension: 'png' })
                            });
                        } catch {}
                    }

                    treeData.children.push({
                        username: cUser.user ? cUser.user.username : cUser.username,
                        id: cUser.id,
                        color: cColor,
                        displayAvatarURL: () => cUser.displayAvatarURL({ extension: 'png' }),
                        partners: cPartners,
                        offspring: grandChildren
                    });
                } catch (e) { console.error(e); }
            }
        }

        // التحقق من الوحدة
        if (treeData.parents.length === 0 && treeData.partners.length === 0 && treeData.children.length === 0) {
            const msg = await message.reply({ content: `🍂 **شجرة ${targetUser.username} فارغة تماماً!**\nلم يبدأ عائلته بعد وليس لديه والدين مسجلين.` });
            setTimeout(() => msg.delete().catch(() => {}), 5000);
            return; 
        }

        let currentPage = 0;
        const totalPages = Math.ceil(treeData.children.length / CHILDREN_PER_PAGE) || 1;

        const getButtons = (page) => {
            const row = new ActionRowBuilder();
            row.addComponents(
                new ButtonBuilder().setCustomId('prev_tree').setStyle(ButtonStyle.Secondary).setEmoji('1439164494759723029').setDisabled(page === 0),
                new ButtonBuilder().setCustomId('next_tree').setStyle(ButtonStyle.Secondary).setEmoji('1439164491072929915').setDisabled(page >= totalPages - 1)
            );
            return row;
        };

        const img = await drawTreePage(treeData, currentPage);
        const msg = await message.reply({ 
            files: [img],
            components: totalPages > 1 ? [getButtons(currentPage)] : []
        });

        if (totalPages <= 1) return;

        const collector = msg.createMessageComponentCollector({ 
            filter: i => i.user.id === message.author.id, 
            time: 300000,
            componentType: ComponentType.Button 
        });

        collector.on('collect', async i => {
            if (i.customId === 'prev_tree') currentPage--;
            if (i.customId === 'next_tree') currentPage++;
            await i.deferUpdate();
            const newImg = await drawTreePage(treeData, currentPage);
            await i.editReply({ files: [newImg], components: [getButtons(currentPage)] });
        });

        collector.on('end', () => msg.edit({ components: [] }).catch(()=>{}));
    }
};
