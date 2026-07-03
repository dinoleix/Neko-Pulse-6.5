import React, { useState, useEffect } from 'react';
import { CrewMember, CrewDocument } from '../../../types';
import { hrService } from '../../../services/hrService';
import { Button, Card, Input, Select, Badge, TextArea } from '../../../components/SharedComponents';
import { FileText, Upload, Printer, Trash2, Eye, User, Briefcase, Image as ImageIcon, RotateCcw, Save, Loader2, File, Star } from 'lucide-react';
import { format } from 'date-fns';

// --- CONSTANTS ---
const PLACEHOLDERS = {
    OFFER: ['{{crewName}}', '{{role}}', '{{joinDate}}', '{{salary}}', '{{email}}', '{{phone}}'],
    RELIEVING: ['{{crewName}}', '{{role}}', '{{joinDate}}', '{{leaveDate}}', '{{crewCode}}'],
    EXPERIENCE: ['{{crewName}}', '{{role}}', '{{joinDate}}', '{{leaveDate}}', '{{heShe}}', '{{HeShe}}', '{{himHer}}', '{{hisHer}}', '{{HisHer}}']
};

const DEFAULT_TEMPLATES: Record<string, { subject: string, content: string }> = {
    OFFER: {
        subject: "Subject: Offer of Employment",
        content: `
            <p>Dear {{crewName}},</p>
            <p>We are pleased to offer you the position of <strong>{{role}}</strong> at Neko Pulse Cafe.</p>
            <p>Your employment will commence on <strong>{{joinDate}}</strong>.</p>
            <p>Your starting monthly salary will be <strong>{{salary}}</strong>.</p>
            <p>We are excited to have you join our team and look forward to your contribution to our success.</p>
            <p>Please sign and return the duplicate copy of this letter as a token of your acceptance.</p>
            <div class="signature">
                <p>Sincerely,</p>
                <br><br>
                <p><strong>HR Manager</strong><br>Neko Pulse Cafe</p>
            </div>
        `
    },
    RELIEVING: {
        subject: "Subject: Relieving Letter",
        content: `
            <p>Dear {{crewName}},</p>
            <p>This is to certify that you were employed with Neko Pulse Cafe as <strong>{{role}}</strong> from <strong>{{joinDate}}</strong> to <strong>{{leaveDate}}</strong>.</p>
            <p>We would like to thank you for your services and contribution to the organization. You have been relieved of your duties effective close of business hours on {{leaveDate}}.</p>
            <p>We wish you all the best in your future endeavors.</p>
            <div class="signature">
                <p>Sincerely,</p>
                <br><br>
                <p><strong>HR Manager</strong><br>Neko Pulse Cafe</p>
            </div>
        `
    },
    EXPERIENCE_POOR: {
        subject: "Subject: Experience Certificate",
        content: `
            <p>To Whom It May Concern,</p>
            <p>This is to certify that <strong>{{crewName}}</strong> was employed with Neko Pulse Cafe as <strong>{{role}}</strong> from <strong>{{joinDate}}</strong> to <strong>{{leaveDate}}</strong>.</p>
            <p>During the tenure of employment, {{heShe}} fulfilled the responsibilities assigned to {{himHer}} as per the company norms.</p>
            <p>We wish {{himHer}} success in future endeavors.</p>
            <div class="signature">
                <p>Sincerely,</p>
                <br><br>
                <p><strong>HR Manager</strong><br>Neko Pulse Cafe</p>
            </div>
        `
    },
    EXPERIENCE_GOOD: {
        subject: "Subject: Experience Certificate",
        content: `
            <p>To Whom It May Concern,</p>
            <p>This is to certify that <strong>{{crewName}}</strong> was employed with Neko Pulse Cafe as <strong>{{role}}</strong> from <strong>{{joinDate}}</strong> to <strong>{{leaveDate}}</strong>.</p>
            <p>During {{hisHer}} tenure, {{heShe}} demonstrated a good understanding of {{hisHer}} role and contributed effectively to the team operations. {{HeShe}} was diligent and maintained professional conduct.</p>
            <p>We appreciate {{hisHer}} contribution and wish {{himHer}} the very best in {{hisHer}} future career.</p>
            <div class="signature">
                <p>Sincerely,</p>
                <br><br>
                <p><strong>HR Manager</strong><br>Neko Pulse Cafe</p>
            </div>
        `
    },
    EXPERIENCE_EXCELLENT: {
        subject: "Subject: Experience Certificate",
        content: `
            <p>To Whom It May Concern,</p>
            <p>This is to certify that <strong>{{crewName}}</strong> was employed with Neko Pulse Cafe as <strong>{{role}}</strong> from <strong>{{joinDate}}</strong> to <strong>{{leaveDate}}</strong>.</p>
            <p>During {{hisHer}} time with us, {{heShe}} proved to be an exceptional team member with outstanding dedication and work ethic. {{HisHer}} performance was exemplary, and {{heShe}} consistently exceeded expectations in the role as {{role}}.</p>
            <p>We highly recommend {{himHer}} for any future opportunities and wish {{himHer}} great success ahead.</p>
            <div class="signature">
                <p>Sincerely,</p>
                <br><br>
                <p><strong>HR Manager</strong><br>Neko Pulse Cafe</p>
            </div>
        `
    }
};

export const HRAdminView: React.FC = () => {
    const [crew, setCrew] = useState<CrewMember[]>([]);
    const [selectedCrewId, setSelectedCrewId] = useState<string>('');
    
    // UI State
    const [viewMode, setViewMode] = useState<'OPERATIONS' | 'SETTINGS'>('OPERATIONS');
    const [opsTab, setOpsTab] = useState<'LETTERS' | 'DOCUMENTS'>('LETTERS');
    
    // Document Upload State
    const [docType, setDocType] = useState<string>('OTHER');
    const [isUploading, setIsUploading] = useState(false);

    // Settings State
    const [companyLogoUrl, setCompanyLogoUrl] = useState<string>('');
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);
    
    // Letterhead Configuration
    const [letterheadConfig, setLetterheadConfig] = useState({
        companyName: 'Green Neko Cafe',
        address: '298 B6 Safdarjung Enclave\nNew Delhi 110029',
        contactInfo: 'hr@greenneko.com'
    });
    const [isSavingLetterhead, setIsSavingLetterhead] = useState(false);

    // Salary Slip State
    const [salarySlipForm, setSalarySlipForm] = useState({
        salary: '',
        bonus: '0',
        deductions: '0',
        month: format(new Date(), 'MMMM'),
        year: format(new Date(), 'yyyy')
    });

    // Relieving/Experience Letter Form State
    const [letterForm, setLetterForm] = useState({
        joinDate: '',
        leaveDate: format(new Date(), 'yyyy-MM-dd'),
        performance: 'GOOD'
    });

    // Template Editor State
    const [customTemplates, setCustomTemplates] = useState<any>({});
    const [editTemplateType, setEditTemplateType] = useState<string>('OFFER');
    const [tempEditForm, setTempEditForm] = useState({ subject: '', content: '' });
    const [isSavingTemplate, setIsSavingTemplate] = useState(false);

    const selectedEmployee = crew.find(c => c.id === selectedCrewId);

    useEffect(() => {
        const load = async () => {
            const [crewData, logoData, tmplData, configData] = await Promise.all([
                hrService.getActiveCrew(),
                hrService.getCompanyLogo(),
                hrService.getTemplates(),
                hrService.getLetterheadConfig()
            ]);

            setCrew(crewData);
            setCompanyLogoUrl(logoData);
            setCustomTemplates(tmplData || {});
            
            if (configData) {
                setLetterheadConfig(configData as any);
            }

            // Init form
            const current = (tmplData || {})['OFFER'] || DEFAULT_TEMPLATES['OFFER'];
            setTempEditForm(current);
        };
        load();
    }, []);

    // Sync Dates when Employee Selected
    useEffect(() => {
        if (selectedEmployee) {
            setLetterForm({
                ...letterForm,
                joinDate: selectedEmployee.dateOfJoining || '',
                leaveDate: selectedEmployee.dateOfLeaving || format(new Date(), 'yyyy-MM-dd')
            });
        }
    }, [selectedEmployee]);

    // Effect to update editor when type changes
    useEffect(() => {
        const current = customTemplates[editTemplateType] || DEFAULT_TEMPLATES[editTemplateType];
        setTempEditForm(current);
    }, [editTemplateType, customTemplates]);

    // --- PRONOUN HELPER ---
    const getPronouns = (gender?: string) => {
        if (gender === 'Male') {
            return { heShe: 'he', HeShe: 'He', himHer: 'him', hisHer: 'his', HisHer: 'His' };
        }
        if (gender === 'Female') {
            return { heShe: 'she', HeShe: 'She', himHer: 'her', hisHer: 'her', HisHer: 'Her' };
        }
        return { heShe: 'they', HeShe: 'They', himHer: 'them', hisHer: 'their', HisHer: 'Their' };
    };

    // --- DOCUMENT LOGIC ---
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.[0] || !selectedEmployee) return;
        setIsUploading(true);
        try {
            const newDoc = await hrService.uploadDocument(e.target.files[0], selectedEmployee.id!, docType);
            const updatedDocs = [...(selectedEmployee.documents || []), newDoc];
            
            await hrService.updateCrewDocuments(selectedEmployee.id!, updatedDocs);
            
            // Local update
            setCrew(prev => prev.map(c => c.id === selectedEmployee.id ? { ...c, documents: updatedDocs } : c));
            alert("Document Uploaded!");
        } catch (error) {
            console.error(error);
            alert("Upload failed.");
        } finally {
            setIsUploading(false);
        }
    };

    const deleteDocument = async (docId: string) => {
        if(!selectedEmployee || !confirm("Delete this document?")) return;
        try {
            const updatedDocs = selectedEmployee.documents?.filter(d => d.id !== docId) || [];
            await hrService.updateCrewDocuments(selectedEmployee.id!, updatedDocs);
            setCrew(prev => prev.map(c => c.id === selectedEmployee.id ? { ...c, documents: updatedDocs } : c));
        } catch (e) {
            alert("Delete failed");
        }
    };

    // --- LOGO LOGIC ---
    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.[0]) return;
        setIsUploadingLogo(true);
        try {
            const url = await hrService.uploadCompanyLogo(e.target.files[0]);
            setCompanyLogoUrl(url);
        } catch (e) {
            alert("Logo upload failed");
        } finally {
            setIsUploadingLogo(false);
        }
    };

    // --- LETTERHEAD CONFIG LOGIC ---
    const saveLetterhead = async () => {
        setIsSavingLetterhead(true);
        try {
            await hrService.saveLetterheadConfig(letterheadConfig);
            alert("Letterhead settings saved!");
        } catch(e) {
            alert("Failed to save letterhead settings.");
        } finally {
            setIsSavingLetterhead(false);
        }
    };

    // --- TEMPLATE EDITING LOGIC ---
    const saveTemplate = async () => {
        setIsSavingTemplate(true);
        try {
            const updatedTemplates = {
                ...customTemplates,
                [editTemplateType]: tempEditForm
            };
            await hrService.saveTemplates(updatedTemplates);
            setCustomTemplates(updatedTemplates);
            alert("Template Saved Successfully!");
        } catch (e) {
            alert("Error saving template");
        } finally {
            setIsSavingTemplate(false);
        }
    };

    const resetTemplate = async () => {
        if (!confirm("Reset to default template? Custom changes will be lost.")) return;
        const updatedTemplates = { ...customTemplates };
        delete updatedTemplates[editTemplateType];
        
        await hrService.saveTemplates(updatedTemplates);
        setCustomTemplates(updatedTemplates);
        setTempEditForm(DEFAULT_TEMPLATES[editTemplateType]);
    };

    // --- LETTER GENERATION LOGIC ---
    const processTemplate = (type: string, data: Record<string, string>) => {
        const tmpl = customTemplates[type] || DEFAULT_TEMPLATES[type];
        let content = tmpl.content;
        let subject = tmpl.subject;
        
        // Replace placeholders
        Object.entries(data).forEach(([key, value]) => {
            const regex = new RegExp(`{{${key}}}`, 'g');
            content = content.replace(regex, value);
        });

        // Add today's date if not in content
        const dateHtml = `<div class="date">${format(new Date(), 'MMMM d, yyyy')}</div>`;
        const toHtml = `<p><strong>To,</strong><br>${data.crewName}<br>${data.email || ''}<br>${data.phone || ''}</p>`;
        const subjectHtml = `<div class="subject">${subject}</div>`;

        return `${dateHtml}${toHtml}${subjectHtml}<div class="content">${content}</div>`;
    };

    const printLetter = (htmlBody: string) => {
        const logoHtml = companyLogoUrl 
            ? `<img src="${companyLogoUrl}" style="max-height: 80px; margin-bottom: 10px;" alt="Company Logo" />` 
            : `<div class="logo">${letterheadConfig.companyName}</div>`;

        const addressHtml = letterheadConfig.address.replace(/\n/g, '<br/>');

        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(`
                <html>
                <head>
                    <title>Print Letter</title>
                    <style>
                        body { font-family: 'Times New Roman', serif; padding: 40px; max-width: 800px; margin: 0 auto; line-height: 1.6; color: #000; }
                        .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #000; padding-bottom: 20px; }
                        .logo { font-size: 30px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; }
                        .subtitle { font-size: 14px; color: #555; margin-top: 5px; white-space: pre-wrap; }
                        .date { text-align: right; margin-bottom: 20px; }
                        .subject { font-weight: bold; text-decoration: underline; margin: 20px 0; }
                        .content { margin-bottom: 40px; text-align: justify; }
                        .signature { margin-top: 60px; }
                        .footer { margin-top: 50px; font-size: 12px; text-align: center; color: #666; border-top: 1px solid #ddd; padding-top: 10px; }
                        @media print {
                            body { -webkit-print-color-adjust: exact; }
                        }
                    </style>
                </head>
                <body>
                    <div class="header">
                        ${logoHtml}
                        <div class="subtitle">${addressHtml}</div>
                    </div>
                    ${htmlBody}
                    <div class="footer">
                        ${letterheadConfig.companyName} | ${letterheadConfig.contactInfo}
                    </div>
                    <script>
                        window.onload = function() { window.print(); }
                    </script>
                </body>
                </html>
            `);
            printWindow.document.close();
        }
    };

    const generateOfferLetter = () => {
        if (!selectedEmployee) return;
        
        // Prompt for salary since it's not stored
        const salary = prompt(`Enter starting monthly salary for ${selectedEmployee.crewName}:`, "");
        if (salary === null) return; // Cancelled

        const html = processTemplate('OFFER', {
            crewName: selectedEmployee.crewName,
            role: selectedEmployee.role || 'Staff',
            joinDate: selectedEmployee.dateOfJoining ? format(new Date(selectedEmployee.dateOfJoining), 'MMMM d, yyyy') : '[Start Date]',
            salary: salary || '______',
            email: selectedEmployee.email || '',
            phone: selectedEmployee.phoneNumber || '',
            ...getPronouns(selectedEmployee.gender)
        });
        printLetter(html);
    };

    const generateRelievingLetter = () => {
        if (!selectedEmployee) return;
        
        const joinDateFormatted = letterForm.joinDate ? format(new Date(letterForm.joinDate), 'MMMM d, yyyy') : '[Join Date]';
        const leaveDateFormatted = letterForm.leaveDate ? format(new Date(letterForm.leaveDate), 'MMMM d, yyyy') : '[Leave Date]';

        const html = processTemplate('RELIEVING', {
            crewName: selectedEmployee.crewName,
            role: selectedEmployee.role || 'Staff',
            joinDate: joinDateFormatted,
            leaveDate: leaveDateFormatted,
            crewCode: selectedEmployee.crewCode,
            ...getPronouns(selectedEmployee.gender)
        });
        printLetter(html);
    };

    const generateExperienceLetter = () => {
        if (!selectedEmployee) return;

        if (!letterForm.joinDate || !letterForm.leaveDate) {
            alert("Join Date and Leave Date are required for Experience Letter.");
            return;
        }

        const templateId = `EXPERIENCE_${letterForm.performance}`;
        const joinDateFormatted = format(new Date(letterForm.joinDate), 'MMMM d, yyyy');
        const leaveDateFormatted = format(new Date(letterForm.leaveDate), 'MMMM d, yyyy');

        const html = processTemplate(templateId, {
            crewName: selectedEmployee.crewName,
            role: selectedEmployee.role || 'Staff',
            joinDate: joinDateFormatted,
            leaveDate: leaveDateFormatted,
            ...getPronouns(selectedEmployee.gender)
        });
        printLetter(html);
    };

    const generateSalarySlip = () => {
        if (!selectedEmployee) return;

        const basic = parseFloat(salarySlipForm.salary) || 0;
        const bonus = parseFloat(salarySlipForm.bonus) || 0;
        const deductions = parseFloat(salarySlipForm.deductions) || 0;
        const net = basic + bonus - deductions;

        const html = `
            <h2 style="text-align:center; text-decoration:underline;">Payslip for ${salarySlipForm.month} ${salarySlipForm.year}</h2>
            <br/>
            <table style="width:100%; border-collapse: collapse; margin-bottom: 20px;">
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;"><strong>Employee Name</strong></td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${selectedEmployee.crewName}</td>
                    <td style="padding: 8px; border: 1px solid #ddd;"><strong>Designation</strong></td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${selectedEmployee.role}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;"><strong>Employee ID</strong></td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${selectedEmployee.crewCode}</td>
                    <td style="padding: 8px; border: 1px solid #ddd;"><strong>Date of Joining</strong></td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${selectedEmployee.dateOfJoining || '-'}</td>
                </tr>
            </table>

            <table style="width:100%; border-collapse: collapse;">
                <thead style="background-color: #f3f4f6;">
                    <tr>
                        <th style="padding: 10px; border: 1px solid #000; text-align: left;">Earnings</th>
                        <th style="padding: 10px; border: 1px solid #000; text-align: right;">Amount</th>
                        <th style="padding: 10px; border: 1px solid #000; text-align: left;">Deductions</th>
                        <th style="padding: 10px; border: 1px solid #000; text-align: right;">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #000;">Basic Salary</td>
                        <td style="padding: 10px; border: 1px solid #000; text-align: right;">${basic.toFixed(2)}</td>
                        <td style="padding: 10px; border: 1px solid #000;">Deductions</td>
                        <td style="padding: 10px; border: 1px solid #000; text-align: right;">${deductions.toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #000;">Bonus / Incentives</td>
                        <td style="padding: 10px; border: 1px solid #000; text-align: right;">${bonus.toFixed(2)}</td>
                        <td style="padding: 10px; border: 1px solid #000;"></td>
                        <td style="padding: 10px; border: 1px solid #000; text-align: right;"></td>
                    </tr>
                    <tr style="font-weight: bold; background-color: #f9fafb;">
                        <td style="padding: 10px; border: 1px solid #000;">Gross Earnings</td>
                        <td style="padding: 10px; border: 1px solid #000; text-align: right;">${(basic + bonus).toFixed(2)}</td>
                        <td style="padding: 10px; border: 1px solid #000;">Total Deductions</td>
                        <td style="padding: 10px; border: 1px solid #000; text-align: right;">${deductions.toFixed(2)}</td>
                    </tr>
                </tbody>
            </table>

            <div style="margin-top: 20px; padding: 15px; border: 2px solid #000; text-align: center; font-size: 18px;">
                <strong>Net Pay: ${net.toFixed(2)}</strong>
            </div>

            <div style="margin-top: 50px; text-align:center; font-size:12px; color:#666;">
                <p>This is a computer-generated payslip and does not require a signature.</p>
            </div>
        `;
        printLetter(html);
    };

    return (
        <div className="max-w-7xl mx-auto p-6 flex flex-col md:flex-row gap-6 min-h-[80vh]">
            {/* LEFT SIDEBAR: EMPLOYEE LIST */}
            <Card className="w-full md:w-1/3 bg-white h-fit sticky top-6">
                <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><User className="w-5 h-5"/> Select Employee</h3>
                <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-2">
                    {crew.map(c => (
                        <div 
                            key={c.id} 
                            onClick={() => { setSelectedCrewId(c.id!); setViewMode('OPERATIONS'); }}
                            className={`p-3 rounded-xl border cursor-pointer transition-all ${selectedCrewId === c.id ? 'bg-indigo-50 border-indigo-500 shadow-sm' : 'bg-white border-slate-100 hover:bg-slate-50'}`}
                        >
                            <div className="font-bold text-slate-800">{c.crewName}</div>
                            <div className="text-xs text-slate-500 flex gap-2">
                                <span>{c.role}</span>•<span>{c.crewCode}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </Card>

            {/* RIGHT MAIN CONTENT */}
            <div className="flex-1 space-y-6">
                <div className="flex justify-end">
                     <button 
                        onClick={() => setViewMode('SETTINGS')} 
                        className={`text-xs font-bold px-3 py-1 rounded-full border ${viewMode === 'SETTINGS' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-500'}`}
                     >
                        HR Settings
                     </button>
                </div>

                {viewMode === 'SETTINGS' ? (
                    <div className="space-y-6 animate-in fade-in">
                        {/* 1. ASSETS CARD */}
                        <Card title="Company Assets">
                            <div className="space-y-4">
                                <div>
                                    <h3 className="font-bold text-slate-700 mb-2">Company Logo</h3>
                                    <div className="flex items-center gap-4">
                                        <div className="w-24 h-24 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center overflow-hidden">
                                            {companyLogoUrl ? <img src={companyLogoUrl} alt="Logo" className="w-full h-full object-contain"/> : <ImageIcon className="w-8 h-8 text-slate-300"/>}
                                        </div>
                                        <div>
                                            <label className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold cursor-pointer transition-colors flex items-center gap-2">
                                                {isUploadingLogo ? <Loader2 className="w-4 h-4 animate-spin"/> : <Upload className="w-4 h-4"/>}
                                                Upload Logo
                                                <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} disabled={isUploadingLogo}/>
                                            </label>
                                            <p className="text-xs text-slate-400 mt-2">Used in letter headers.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Card>

                        {/* 2. LETTERHEAD CONFIG CARD */}
                        <Card title="Letterhead Configuration">
                            <div className="grid md:grid-cols-2 gap-6">
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Company Name</label>
                                    <Input 
                                        value={letterheadConfig.companyName} 
                                        onChange={e => setLetterheadConfig({...letterheadConfig, companyName: e.target.value})} 
                                        placeholder="e.g. Neko Pulse Cafe Pvt Ltd"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Header Text (Address)</label>
                                    <TextArea 
                                        value={letterheadConfig.address} 
                                        onChange={e => setLetterheadConfig({...letterheadConfig, address: e.target.value})} 
                                        placeholder="e.g. 123 Street, City&#10;State - Zip"
                                        className="h-24 !min-h-0"
                                    />
                                    <p className="text-xs text-slate-400 mt-1">Appears below the logo. Use new lines for formatting.</p>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Footer Text</label>
                                    <TextArea 
                                        value={letterheadConfig.contactInfo} 
                                        onChange={e => setLetterheadConfig({...letterheadConfig, contactInfo: e.target.value})} 
                                        placeholder="e.g. hr@domain.com | +91 99999 99999"
                                        className="h-24 !min-h-0"
                                    />
                                    <p className="text-xs text-slate-400 mt-1">Appears at the bottom of every page.</p>
                                </div>
                            </div>
                            <div className="mt-6 flex justify-end">
                                <Button onClick={saveLetterhead} isLoading={isSavingLetterhead} className="!w-auto">
                                    <Save className="w-4 h-4 mr-2"/> Save Letterhead Config
                                </Button>
                            </div>
                        </Card>

                        {/* 3. TEMPLATE EDITOR CARD */}
                        <Card title="Letter Templates">
                            <div className="flex flex-col md:flex-row gap-6">
                                <div className="flex-1">
                                    <div className="flex justify-between items-center mb-4">
                                        <Select 
                                            value={editTemplateType} 
                                            onChange={e => setEditTemplateType(e.target.value)}
                                            className="!w-auto min-w-[200px]"
                                        >
                                            <option value="OFFER">Offer Letter</option>
                                            <option value="RELIEVING">Relieving Letter</option>
                                            <option value="EXPERIENCE_EXCELLENT">Exp. Letter (Excellent)</option>
                                            <option value="EXPERIENCE_GOOD">Exp. Letter (Good)</option>
                                            <option value="EXPERIENCE_POOR">Exp. Letter (Poor)</option>
                                        </Select>
                                        <div className="flex gap-2">
                                            <Button variant="secondary" className="!w-auto !p-2" onClick={resetTemplate} title="Reset to Default">
                                                <RotateCcw className="w-4 h-4"/>
                                            </Button>
                                            <Button className="!w-auto !p-2 px-4" onClick={saveTemplate} isLoading={isSavingTemplate}>
                                                Save Template
                                            </Button>
                                        </div>
                                    </div>
                                    
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-xs font-bold text-slate-400 uppercase">Subject Line</label>
                                            <Input value={tempEditForm.subject} onChange={e => setTempEditForm({...tempEditForm, subject: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-400 uppercase">Email Body (HTML Supported)</label>
                                            <TextArea 
                                                value={tempEditForm.content} 
                                                onChange={e => setTempEditForm({...tempEditForm, content: e.target.value})} 
                                                className="!min-h-[300px] font-mono text-sm"
                                            />
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="w-full md:w-64 bg-slate-50 p-4 rounded-xl h-fit">
                                    <h4 className="font-bold text-slate-700 text-sm mb-3">Available Placeholders</h4>
                                    <p className="text-xs text-slate-400 mb-4">Copy and paste these into the template. They will be replaced with actual data.</p>
                                    <div className="flex flex-wrap gap-2">
                                        {(PLACEHOLDERS[editTemplateType.split('_')[0]] || PLACEHOLDERS.EXPERIENCE).map(p => (
                                            <Badge key={p} variant="neutral" className="cursor-pointer hover:bg-indigo-100 hover:text-indigo-600" onClick={() => {
                                                setTempEditForm(prev => ({ ...prev, content: prev.content + ` ${p}` }));
                                            }}>
                                                {p}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </Card>
                    </div>
                ) : !selectedEmployee ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-3xl p-12">
                        <Briefcase className="w-16 h-16 mb-4 opacity-20"/>
                        <p className="font-bold">Select an employee to manage HR files</p>
                    </div>
                ) : (
                    <>
                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex justify-between items-center">
                            <div>
                                <h1 className="text-2xl font-bold text-slate-800">{selectedEmployee.crewName}</h1>
                                <p className="text-slate-500">{selectedEmployee.role} • {selectedEmployee.outletId}</p>
                            </div>
                            <div className="flex bg-slate-100 p-1 rounded-xl">
                                <button onClick={() => setOpsTab('LETTERS')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${opsTab === 'LETTERS' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>Letters</button>
                                <button onClick={() => setOpsTab('DOCUMENTS')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${opsTab === 'DOCUMENTS' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>Documents</button>
                            </div>
                        </div>

                        {opsTab === 'LETTERS' && (
                            <div className="grid md:grid-cols-2 gap-6 animate-in fade-in">
                                <Card title="Offer Letter">
                                    <div className="text-sm text-slate-500 mb-4">Generates an offer letter. You will be prompted to enter the salary manually.</div>
                                    <Button onClick={generateOfferLetter} variant="secondary">
                                        <Printer className="w-4 h-4 mr-2"/> Generate Offer Letter
                                    </Button>
                                </Card>

                                <Card title="Experience & Relieving Info" className="md:row-span-2">
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Date of Joining</label>
                                                <Input type="date" value={letterForm.joinDate} onChange={e => setLetterForm({...letterForm, joinDate: e.target.value})} className="!py-2" />
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Date of Leaving</label>
                                                <Input type="date" value={letterForm.leaveDate} onChange={e => setLetterForm({...letterForm, leaveDate: e.target.value})} className="!py-2" />
                                            </div>
                                        </div>
                                        
                                        <div className="pt-4 border-t border-slate-100">
                                            <h4 className="text-xs font-bold text-slate-700 uppercase mb-2">Relieving Letter</h4>
                                            <Button onClick={generateRelievingLetter} variant="secondary" className="!bg-slate-800 text-white hover:!bg-slate-900 border-none">
                                                <Printer className="w-4 h-4 mr-2"/> Print Relieving Letter
                                            </Button>
                                        </div>

                                        <div className="pt-4 border-t border-slate-100">
                                            <h4 className="text-xs font-bold text-slate-700 uppercase mb-2 flex items-center gap-1"><Star className="w-3 h-3 text-amber-500"/> Experience Letter</h4>
                                            <div className="mb-3">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Performance Rating</label>
                                                <Select value={letterForm.performance} onChange={e => setLetterForm({...letterForm, performance: e.target.value})}>
                                                    <option value="EXCELLENT">Excellent Performer</option>
                                                    <option value="GOOD">Good Performer</option>
                                                    <option value="POOR">Poor Performer</option>
                                                </Select>
                                            </div>
                                            <Button onClick={generateExperienceLetter} variant="primary" className="!bg-indigo-600 hover:!bg-indigo-700 shadow-indigo-100">
                                                <Printer className="w-4 h-4 mr-2"/> Generate Experience Letter
                                            </Button>
                                        </div>
                                    </div>
                                </Card>

                                <Card title="Salary Slip" className="border-t-4 border-t-emerald-400">
                                    <div className="grid grid-cols-2 gap-3 mb-4">
                                        <div className="col-span-2 flex gap-2">
                                            <Input value={salarySlipForm.month} onChange={e => setSalarySlipForm({...salarySlipForm, month: e.target.value})} placeholder="Month" className="!py-2" />
                                            <Input value={salarySlipForm.year} onChange={e => setSalarySlipForm({...salarySlipForm, year: e.target.value})} placeholder="Year" className="!py-2" />
                                        </div>
                                        <Input type="number" value={salarySlipForm.salary} onChange={e => setSalarySlipForm({...salarySlipForm, salary: e.target.value})} placeholder="Basic" className="!py-2" />
                                        <Input type="number" value={salarySlipForm.bonus} onChange={e => setSalarySlipForm({...salarySlipForm, bonus: e.target.value})} placeholder="Bonus" className="!py-2" />
                                        <Input type="number" value={salarySlipForm.deductions} onChange={e => setSalarySlipForm({...salarySlipForm, deductions: e.target.value})} placeholder="Deductions" className="col-span-2 !py-2" />
                                    </div>
                                    <Button onClick={generateSalarySlip} variant="primary">
                                        <Printer className="w-4 h-4 mr-2"/> Print Payslip
                                    </Button>
                                </Card>
                            </div>
                        )}

                        {opsTab === 'DOCUMENTS' && (
                            <div className="space-y-6 animate-in fade-in">
                                <Card title="Upload New Document">
                                    <div className="flex gap-4 items-end">
                                        <div className="flex-1">
                                            <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Document Type</label>
                                            <Select value={docType} onChange={e => setDocType(e.target.value)}>
                                                <option value="OTHER">Other</option>
                                                <option value="OFFER_SIGNED">Signed Offer Letter</option>
                                                <option value="ID_PROOF">ID Proof (Generic)</option>
                                                <option value="RESUME">Resume/CV</option>
                                            </Select>
                                        </div>
                                        <div className="flex-1">
                                            <label className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3.5 px-4 rounded-2xl cursor-pointer transition-colors border border-transparent hover:border-slate-300">
                                                {isUploading ? <Loader2 className="w-5 h-5 animate-spin"/> : <Upload className="w-5 h-5"/>}
                                                {isUploading ? "Uploading..." : "Select File"}
                                                <input type="file" className="hidden" onChange={handleFileUpload} disabled={isUploading} accept=".pdf,image/*" />
                                            </label>
                                        </div>
                                    </div>
                                </Card>

                                <div className="space-y-3">
                                    <h3 className="font-bold text-slate-700">Repository</h3>
                                    {selectedEmployee.documents?.map(doc => (
                                        <div key={doc.id} className="bg-white p-4 rounded-xl border border-slate-100 flex items-center justify-between hover:shadow-md transition-shadow">
                                            <div className="flex items-center gap-4">
                                                <div className={`p-3 rounded-lg ${doc.type === 'OFFER_SIGNED' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-500'}`}>
                                                    {doc.type === 'OFFER_SIGNED' ? <FileText className="w-6 h-6"/> : <File className="w-6 h-6"/>}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-800">{doc.type.replace('_', ' ')}</div>
                                                    <div className="text-xs text-slate-500">{doc.name} • {format(doc.uploadedAt?.toDate ? doc.uploadedAt.toDate() : new Date(doc.uploadedAt), 'MMM d, yyyy')}</div>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <a href={doc.url} target="_blank" rel="noreferrer" className="p-2 text-indigo-500 hover:bg-indigo-50 rounded-lg">
                                                    <Eye className="w-5 h-5"/>
                                                </a>
                                                <button onClick={() => deleteDocument(doc.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                                                    <Trash2 className="w-5 h-5"/>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {(!selectedEmployee.documents || selectedEmployee.documents.length === 0) && (
                                        <p className="text-center py-8 text-slate-400 italic">No documents uploaded yet.</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};