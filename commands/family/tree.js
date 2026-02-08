const { SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const Canvas = require('canvas');
const path = require('path');

// 🔥 تحميل الخطوط
try {
    Canvas.registerFont(path.join(__dirname, '../../efonts/NotoEmoj.ttf'), { family: 'MyEmoji' });
    Canvas.registerFont(path.join(__dirname, '../../fonts/bein-ar-normal.ttf'), { family: 'Bein' }); 
} catch (e) { 
    // تجاهل
}

// ✅✅ إيقاف وضع التجربة (يعمل الآن على الداتابيس) ✅✅
const TEST_MODE = false; 

const CHILDREN_PER_PAGE = 4;

// الألوان
const THEME = {
    BG_TOP: "#14161f",    // كحلي غامق جداً
    BG_BOT: "#0a0b10",    // أسود تقريباً
    GRID: "rgba(255, 255, 255, 0.03)", // لون الشبكة الخلفية
    MALE: "#00a8ff",
    FEMALE: "#ff0055",
    DEFAULT: "#00ff88",
    GOLD: "#ffd700",
    LINE: "#cfd8dc",      // لون الخطوط
    TEXT: "#ffffff",
    NAME_BG: "rgba(0, 0, 0, 0.85)" 
};

// الأبعاد
const DIMS = {
    NODE: 80,
    PARTNER: 65,
    KID: 60,
    GRAND: 45,
    LEVEL_GAP: 240,
    SIB_GAP: 40,
};

// دالة مساعدة: جلب لون العضو
async function getUserColor(client, userId, guild) {
    if (TEST_MODE) return THEME.DEFAULT;
    try {
        const sql = client.sql;
        const config = sql.prepare("SELECT * FROM family_config WHERE guildID = ?").get(guild.id);
        if (!config) return THEME.DEFAULT;
        
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) return THEME.DEFAULT;
        
        if (config.maleRole && member.roles.cache.has(config.maleRole)) return THEME.MALE;
        if (config.femaleRole && member.roles.cache.has(config.femaleRole)) return THEME.FEMALE;
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

    for (let child of currentChildren) {
        const spouseW = (child.partners.length * (DIMS.PARTNER * 2 + 10));
        const topW = (DIMS.KID * 2) + spouseW;
        const grandCount = child.offspring.length;
        const botW = grandCount * (DIMS.GRAND * 2 + 10);
        const blockW = Math.max(topW, botW, DIMS.KID * 3);
        
        childBlocks.push({ data: child, width: blockW, spouseW: spouseW });
        totalWidth += blockW + DIMS.SIB_GAP;
    }

    const minWidth = 1000;
    const partnersWidth = (treeData.partners.length * (DIMS.PARTNER * 2 + 20)) + (DIMS.NODE * 2);
    const canvasWidth = Math.max(totalWidth, partnersWidth, minWidth) + 100;
    const canvasHeight = 900;
    const centerX = canvasWidth / 2;

    const canvas = Canvas.createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    // 1. رسم الخلفية المتدرجة
    const grad = ctx.createLinearGradient(0, 0, 0, canvasHeight);
    grad.addColorStop(0, THEME.BG_TOP);
    grad.addColorStop(1, THEME.BG_BOT);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // 2. رسم شبكة احترافية (Grid)
    ctx.lineWidth = 1;
    ctx.strokeStyle = THEME.GRID;
    const gridSize = 50;
    for(let x=0; x<canvasWidth; x+=gridSize) {
        ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvasHeight); ctx.stroke();
    }
    for(let y=0; y<canvasHeight; y+=gridSize) {
        ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvasWidth,y); ctx.stroke();
    }

    // 3. تأثير Vignette
    const radGrad = ctx.createRadialGradient(centerX, canvasHeight/2, 100, centerX, canvasHeight/2, canvasWidth);
    radGrad.addColorStop(0, "rgba(0,0,0,0)");
    radGrad.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = radGrad;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);


    // --- دوال الرسم ---

    function drawNameLabel(name, x, y, color) {
        const fontSize = 18;
        ctx.font = `bold ${fontSize}px "Bein", "MyEmoji", "Sans"`;
        const textMetrics = ctx.measureText(name);
        const textWidth = textMetrics.width;
        const padding = 10;
        const boxWidth = textWidth + (padding * 2);
        const boxHeight = 35;
        const boxX = x - (boxWidth / 2);
        const boxY = y + 15;

        // الظل للإطار
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 5;

        ctx.fillStyle = THEME.NAME_BG;
        ctx.beginPath();
        ctx.moveTo(boxX + 10, boxY);
        ctx.lineTo(boxX + boxWidth - 10, boxY);
        ctx.quadraticCurveTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + 10);
        ctx.lineTo(boxX + boxWidth, boxY + boxHeight - 10);
        ctx.quadraticCurveTo(boxX + boxWidth, boxY + boxHeight, boxX + boxWidth - 10, boxY + boxHeight);
        ctx.lineTo(boxX + 10, boxY + boxHeight);
        ctx.quadraticCurveTo(boxX, boxY + boxHeight, boxX, boxY + boxHeight - 10);
        ctx.lineTo(boxX, boxY + 10);
        ctx.quadraticCurveTo(boxX, boxY, boxX + 10, boxY);
        ctx.closePath();
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
            if (typeof user.displayAvatarURL === 'function') {
                url = user.displayAvatarURL({ extension: 'png', size: 256 });
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

        // الإطار
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
    // 🖌️ بدء الرسم
    // ==========================================

    const Y1 = 150; 
    const Y2 = Y1 + DIMS.LEVEL_GAP; 
    const Y3 = Y2 + DIMS.LEVEL_GAP; 

    // رسم الخطوط أولاً

    // 1. خطوط الزوجات
    let leftP = [], rightP = [];
    treeData.partners.forEach((p, i) => (i%2===0 ? rightP : leftP).push(p));

    let pX = centerX + DIMS.NODE + 40;
    for(const p of rightP) {
        pX += DIMS.PARTNER;
        drawHorizontalLine(centerX + DIMS.NODE, Y1, pX - DIMS.PARTNER, THEME.FEMALE);
        pX += DIMS.PARTNER + 20;
    }
    pX = centerX - DIMS.NODE - 40;
    for(const p of leftP) {
        pX -= DIMS.PARTNER;
        drawHorizontalLine(centerX - DIMS.NODE, Y1, pX + DIMS.PARTNER, THEME.FEMALE);
        pX -= DIMS.PARTNER - 20;
    }

    // 2. خطوط الأبناء والأحفاد
    if (childBlocks.length > 0) {
        drawElbowLine(centerX, Y1 + DIMS.NODE, centerX, Y2 - DIMS.KID - 40);

        let currentX = centerX - (totalWidth / 2);
        
        for(const block of childBlocks) {
            const blockCenter = currentX + (block.width / 2);
            const kidRealX = blockCenter - (block.spouseW / 2);

            drawElbowLine(centerX, Y1 + DIMS.NODE, kidRealX, Y2 - DIMS.KID);
            
            let spX = kidRealX + DIMS.KID + 20;
            let lastSpouseX = kidRealX;
            if (block.data.partners && block.data.partners.length > 0) {
                for (const sp of block.data.partners) {
                    spX += DIMS.PARTNER;
                    drawHorizontalLine(kidRealX, Y2, spX, THEME.FEMALE);
                    lastSpouseX = spX;
                    spX += DIMS.PARTNER + 10;
                }
            }

            let parentsCenterX = (kidRealX + lastSpouseX) / 2;
            if (block.data.offspring.length > 0) {
                const grandCount = block.data.offspring.length;
                const grandTotalW = grandCount * (DIMS.GRAND * 2 + 10);
                let grandX = blockCenter - (grandTotalW / 2) + DIMS.GRAND;

                const linkYStart = Y2 + (block.data.partners.length > 0 ? 0 : DIMS.KID); 
                const linkYEnd = Y3 - DIMS.GRAND;

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

    // 1. الأب
    await drawCircleImg(treeData.main, centerX, Y1, DIMS.NODE, true);

    // 2. الزوجات
    pX = centerX + DIMS.NODE + 40;
    for(const p of rightP) {
        pX += DIMS.PARTNER;
        await drawCircleImg(p, pX, Y1, DIMS.PARTNER);
        pX += DIMS.PARTNER + 20;
    }
    pX = centerX - DIMS.NODE - 40;
    for(const p of leftP) {
        pX -= DIMS.PARTNER;
        await drawCircleImg(p, pX, Y1, DIMS.PARTNER);
        pX -= DIMS.PARTNER - 20;
    }

    // 3. الأبناء
    let currentX = centerX - (totalWidth / 2);
    for(const block of childBlocks) {
        const blockCenter = currentX + (block.width / 2);
        const kidRealX = blockCenter - (block.spouseW / 2);

        await drawCircleImg(block.data, kidRealX, Y2, DIMS.KID);

        // زوجات الابن
        let spX = kidRealX + DIMS.KID + 20;
        if (block.data.partners) {
            for (const sp of block.data.partners) {
                spX += DIMS.PARTNER;
                await drawCircleImg(sp, spX, Y2, DIMS.PARTNER);
                spX += DIMS.PARTNER + 10;
            }
        }

        // الأحفاد
        if (block.data.offspring.length > 0) {
            const grandCount = block.data.offspring.length;
            const grandTotalW = grandCount * (DIMS.GRAND * 2 + 10);
            let grandX = blockCenter - (grandTotalW / 2) + DIMS.GRAND;

            for (const grand of block.data.offspring) {
                await drawCircleImg(grand, grandX, Y3, DIMS.GRAND);
                grandX += DIMS.GRAND * 2 + 10;
            }
        }
        currentX += block.width + DIMS.SIB_GAP;
    }

    // رقم الصفحة
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = '20px "Sans"';
    ctx.fillText(`الصفحة ${pageIndex + 1}`, canvasWidth - 80, canvasHeight - 30);

    return new AttachmentBuilder(canvas.toBuffer(), { name: 'family-tree.png' });
}

module.exports = {
    name: 'tree',
    description: 'عرض شجرة العائلة',
    aliases: ['شجرة', 'family'],
    
    async execute(message, args) {
        const client = message.client;
        const guild = message.guild;

        // 1. تحديد المستخدم المستهدف (منشن أو آيدي أو صاحب الرسالة)
        // 🔥 التعديل هنا: يدعم المنشن الآن
        const targetMember = message.mentions.members.first() || 
                             message.guild.members.cache.get(args[0]) || 
                             message.member;
                             
        const user = targetMember.user;

        let treeData = {
            main: { 
                username: user.username, 
                color: THEME.GOLD, 
                id: user.id, 
                displayAvatarURL: () => user.displayAvatarURL({ extension: 'png' }) 
            },
            partners: [],
            children: [] 
        };

        if (TEST_MODE) {
            // (كود التست مود كما هو...)
            // ... (تم اختصاره هنا لأنه غير مفعل)
        } else {
            const sql = client.sql;
            treeData.main.color = await getUserColor(client, user.id, guild);
            
            // جلب الزوجات
            const marriages = sql.prepare("SELECT partnerID FROM marriages WHERE userID = ? AND guildID = ?").all(user.id, guild.id);
            for (const m of marriages) {
                try {
                    const pUser = await client.users.fetch(m.partnerID);
                    const color = await getUserColor(client, pUser.id, guild);
                    
                    treeData.partners.push({ 
                        username: pUser.username,
                        id: pUser.id,
                        color: color,
                        displayAvatarURL: () => pUser.displayAvatarURL({ extension: 'png' })
                    });
                } catch {}
            }

            // 🔥 التعديل الذكي: جلب الأبناء (بما في ذلك أبناء الزوجات لضمان عدم النقص)
            let childrenRows = sql.prepare("SELECT childID FROM children WHERE parentID = ? AND guildID = ?").all(user.id, guild.id);
            
            // إضافة أطفال الشركاء أيضاً (لحل مشكلة أن الأطفال مسجلين عند أحد الطرفين فقط)
            for (const p of treeData.partners) {
                const stepRows = sql.prepare("SELECT childID FROM children WHERE parentID = ? AND guildID = ?").all(p.id, guild.id);
                for (const row of stepRows) {
                    // إذا لم يكن الطفل موجوداً في القائمة، أضفه
                    if (!childrenRows.find(c => c.childID === row.childID)) {
                        childrenRows.push(row);
                    }
                }
            }

            for (const row of childrenRows) {
                try {
                    const cUser = await client.users.fetch(row.childID);
                    const cColor = await getUserColor(client, cUser.id, guild);
                    
                    // جلب زوجات الابن
                    let cPartners = [];
                    const cMarriages = sql.prepare("SELECT partnerID FROM marriages WHERE userID = ? AND guildID = ?").all(cUser.id, guild.id);
                    for (const cm of cMarriages) {
                        try {
                            const cpUser = await client.users.fetch(cm.partnerID);
                            const cpColor = await getUserColor(client, cpUser.id, guild);
                            
                            cPartners.push({ 
                                username: cpUser.username,
                                id: cpUser.id,
                                color: cpColor,
                                displayAvatarURL: () => cpUser.displayAvatarURL({ extension: 'png' })
                            });
                        } catch {}
                    }

                    // جلب أحفاد (أبناء الابن) - وأيضاً أبناء زوجات الابن
                    let grandChildren = [];
                    let grandRows = sql.prepare("SELECT childID FROM children WHERE parentID = ? AND guildID = ?").all(cUser.id, guild.id);
                    
                    // البحث في زوجات الابن أيضاً
                    for(const cp of cPartners) {
                        const stepGrandRows = sql.prepare("SELECT childID FROM children WHERE parentID = ? AND guildID = ?").all(cp.id, guild.id);
                        for (const sRow of stepGrandRows) {
                            if (!grandRows.find(g => g.childID === sRow.childID)) grandRows.push(sRow);
                        }
                    }

                    for (const gRow of grandRows) {
                        try {
                            const gUser = await client.users.fetch(gRow.childID);
                            const gColor = await getUserColor(client, gUser.id, guild);
                            
                            grandChildren.push({ 
                                username: gUser.username,
                                id: gUser.id,
                                color: gColor,
                                displayAvatarURL: () => gUser.displayAvatarURL({ extension: 'png' })
                            });
                        } catch {}
                    }

                    treeData.children.push({
                        username: cUser.username,
                        id: cUser.id,
                        color: cColor,
                        displayAvatarURL: () => cUser.displayAvatarURL({ extension: 'png' }),
                        partners: cPartners,
                        offspring: grandChildren
                    });
                } catch (e) { console.error(e); }
            }
        }

        // ==========================================
        // 🔴🔴 التحقق: هل أنت وحيد؟
        // ==========================================
        if (treeData.partners.length === 0 && treeData.children.length === 0) {
            const msg = await message.reply({ content: `🍂 **شجرة ${user.username} فارغة تماماً!**\nلم يبدأ عائلته بعد.` });
            setTimeout(() => msg.delete().catch(() => {}), 5000);
            return; 
        }

        let currentPage = 0;
        const totalPages = Math.ceil(treeData.children.length / CHILDREN_PER_PAGE) || 1;

        const getButtons = (page) => {
            const row = new ActionRowBuilder();
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('prev_tree')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('1439164494759723029')
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId('next_tree')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('1439164491072929915')
                    .setDisabled(page >= totalPages - 1)
            );
            return row;
        };

        const img = await drawTreePage(treeData, currentPage);
        const msg = await message.reply({ 
            content: `🌳 **شجرة عائلة ${user.username}:**`,
            files: [img],
            components: totalPages > 1 ? [getButtons(currentPage)] : []
        });

        if (totalPages <= 1) return;

        const collector = msg.createMessageComponentCollector({ 
            filter: i => i.user.id === message.author.id, // فقط من كتب الأمر يتحكم بالصفحات
            time: 300000,
            componentType: ComponentType.Button 
        });

        collector.on('collect', async i => {
            if (i.customId === 'prev_tree') currentPage--;
            if (i.customId === 'next_tree') currentPage++;

            await i.deferUpdate();
            
            const newImg = await drawTreePage(treeData, currentPage);
            
            await i.editReply({
                files: [newImg],
                components: [getButtons(currentPage)]
            });
        });

        collector.on('end', () => msg.edit({ components: [] }).catch(()=>{}));
    }
};
