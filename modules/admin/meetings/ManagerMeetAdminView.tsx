
import React, { useState, useEffect } from 'react';
import { firebase } from '../../../firebaseConfig';
import { meetingService } from '../../../services/meetingService';
import { CurrentUser, ManagerMeeting, MeetingAgendaItem, MeetingActionItem, CrewMember } from '../../../types';
import { Button, Card, Input, Select, Checkbox, Badge } from '../../../components/SharedComponents';
import { Calendar, Plus, Trash2, LayoutList, RotateCcw, AlertTriangle, Repeat, Type, Share2, Save, ChevronLeft, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

export const ManagerMeetAdminView: React.FC<{ currentUser: CurrentUser }> = ({ currentUser }) => {
    const [meetings, setMeetings] = useState<ManagerMeeting[]>([]);
    const [activeMeeting, setActiveMeeting] = useState<ManagerMeeting | null>(null);
    const [crew, setCrew] = useState<CrewMember[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // UI State
    const [isCreating, setIsCreating] = useState(false);
    const [newMeetingTitle, setNewMeetingTitle] = useState('');
    const [newMeetingDate, setNewMeetingDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [isDeleting, setIsDeleting] = useState(false);
    
    // Sub-data for active meeting
    const [openGlobalActions, setOpenGlobalActions] = useState<MeetingActionItem[]>([]);
    const [meetingActions, setMeetingActions] = useState<MeetingActionItem[]>([]);
    
    // Form States
    const [newAgendaText, setNewAgendaText] = useState('');
    const [isRecurringAgenda, setIsRecurringAgenda] = useState(false);
    const [newAction, setNewAction] = useState<Partial<MeetingActionItem>>({
        description: '',
        assigneeId: '',
        dueDate: format(new Date(), 'yyyy-MM-dd')
    });

    // Permission Check
    const isSuperAdmin = !currentUser.accessRole || ['Owner', 'Admin'].includes(currentUser.accessRole);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [meets, staff] = await Promise.all([
                meetingService.getMeetings(),
                meetingService.getCrew()
            ]);
            setMeetings(meets);
            setCrew(staff);
        } catch (e) {
            console.error("Load Error", e);
        } finally {
            setIsLoading(false);
        }
    };

    const loadMeetingDetails = async (meeting: ManagerMeeting) => {
        setActiveMeeting(meeting);
        
        try {
            const [currentActions, allOpenActions] = await Promise.all([
                meetingService.getMeetingActions(meeting.id!),
                meetingService.getOpenActions()
            ]);

            setMeetingActions(currentActions);
            // Filter out actions that belong to the current meeting (they are shown in the new actions list)
            setOpenGlobalActions(allOpenActions.filter(a => a.originMeetingId !== meeting.id));
        } catch (e) {
            console.error("Details Load Error", e);
        }
    };

    const createMeeting = async () => {
        if(!newMeetingTitle || !newMeetingDate) return;

        // 1. Fetch Recurring Agenda Items
        let initialAgenda: MeetingAgendaItem[] = [];
        try {
            initialAgenda = await meetingService.getRecurringAgenda();
        } catch (e) {
            console.error("Failed to load recurring agenda", e);
        }

        const newMeet: ManagerMeeting = {
            title: newMeetingTitle,
            date: newMeetingDate,
            status: 'PLANNED',
            notes: '',
            agenda: initialAgenda
        };
        
        try {
            const created = await meetingService.createMeeting(newMeet);
            setMeetings(prev => [created, ...prev]);
            setIsCreating(false);
            loadMeetingDetails(created);
        } catch (e) {
            alert("Failed to create meeting");
        }
    };

    const handleDeleteMeeting = async () => {
        if (!activeMeeting || !activeMeeting.id) return;
        if (!window.confirm(`Are you sure you want to delete "${activeMeeting.title}"?\n\nThis will also remove all action items associated with this meeting. This action cannot be undone.`)) return;

        setIsDeleting(true);
        try {
            await meetingService.deleteMeeting(activeMeeting.id);
            setMeetings(prev => prev.filter(m => m.id !== activeMeeting.id));
            setActiveMeeting(null);
            alert("Meeting deleted successfully.");
        } catch (e) {
            console.error("Delete Error", e);
            alert("Failed to delete meeting.");
        } finally {
            setIsDeleting(false);
        }
    };

    // --- SHARE FUNCTION ---
    const shareMeeting = () => {
        if (!activeMeeting) return;
        
        let text = `*📝 Meeting Summary: ${activeMeeting.title}*\n`;
        text += `📅 ${format(new Date(activeMeeting.date), 'EEEE, MMM d')}\n\n`;

        if (activeMeeting.agenda.length > 0) {
            text += `*Agenda:*\n`;
            activeMeeting.agenda.forEach(item => {
                text += `${item.isDiscussed ? '✅' : '⭕'} ${item.text}\n`;
            });
            text += `\n`;
        }

        if (activeMeeting.notes && activeMeeting.notes.trim()) {
            text += `*Minutes/Notes:*\n${activeMeeting.notes.trim()}\n\n`;
        }

        // Filter actions created in this meeting
        if (meetingActions.length > 0) {
            text += `*Action Items:*\n`;
            meetingActions.forEach(a => {
                text += `🔹 ${a.description} (👤 ${a.assigneeName}) 📅 ${a.dueDate}\n`;
            });
        }

        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    };

    // --- AGENDA OPERATIONS ---
    const addAgendaItem = async () => {
        if(!activeMeeting || !newAgendaText.trim()) return;
        
        // 1. Add to Current Meeting
        const newItem: MeetingAgendaItem = {
            id: Date.now().toString(),
            text: newAgendaText,
            isDiscussed: false,
            addedBy: currentUser.name || 'Admin'
        };
        const updatedAgenda = [...activeMeeting.agenda, newItem];
        
        // Optimistic Update
        setActiveMeeting({ ...activeMeeting, agenda: updatedAgenda });
        setNewAgendaText('');
        
        await meetingService.updateMeeting(activeMeeting.id!, { agenda: updatedAgenda });

        // 2. Handle Recurring Logic
        if (isRecurringAgenda) {
            try {
                await meetingService.addRecurringAgenda(newItem.text, newItem.addedBy);
            } catch (e) {
                console.error("Error saving recurring item", e);
            }
            setIsRecurringAgenda(false); // Reset checkbox
        }
    };

    const toggleAgendaItem = async (itemId: string) => {
        if(!activeMeeting) return;
        const updatedAgenda = activeMeeting.agenda.map(item => 
            item.id === itemId ? { ...item, isDiscussed: !item.isDiscussed } : item
        );
        setActiveMeeting({ ...activeMeeting, agenda: updatedAgenda });
        await meetingService.updateMeeting(activeMeeting.id!, { agenda: updatedAgenda });
    };

    const deleteAgendaItem = async (itemId: string) => {
        if(!activeMeeting) return;
        const updatedAgenda = activeMeeting.agenda.filter(item => item.id !== itemId);
        setActiveMeeting({ ...activeMeeting, agenda: updatedAgenda });
        await meetingService.updateMeeting(activeMeeting.id!, { agenda: updatedAgenda });
    };

    // --- NOTES OPERATIONS ---
    const saveNotes = async () => {
        if(!activeMeeting) return;
        await meetingService.updateMeeting(activeMeeting.id!, { notes: activeMeeting.notes });
        alert("Notes Saved!");
    };

    // --- ACTION ITEM OPERATIONS ---
    const addActionItem = async () => {
        if(!activeMeeting || !newAction.description || !newAction.assigneeId) {
            alert("Description and Assignee are required.");
            return;
        }
        
        const assignee = crew.find(c => c.id === newAction.assigneeId);
        
        const item: MeetingActionItem = {
            description: newAction.description || '',
            assigneeId: newAction.assigneeId,
            assigneeName: assignee?.crewName || 'Unknown',
            dueDate: newAction.dueDate || format(new Date(), 'yyyy-MM-dd'),
            status: 'OPEN',
            originMeetingId: activeMeeting.id!,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            const id = await meetingService.createAction(item);
            setMeetingActions(prev => [...prev, { ...item, id }]);
            setNewAction({ description: '', assigneeId: '', dueDate: format(new Date(), 'yyyy-MM-dd') });
        } catch (e) {
            alert("Failed to add action");
        }
    };

    const toggleActionStatus = async (item: MeetingActionItem, isGlobalList: boolean) => {
        const newStatus = item.status === 'OPEN' ? 'DONE' : 'OPEN';
        
        // Optimistic UI
        if(isGlobalList) {
            setOpenGlobalActions(prev => prev.map(a => a.id === item.id ? { ...a, status: newStatus } : a));
        } else {
            setMeetingActions(prev => prev.map(a => a.id === item.id ? { ...a, status: newStatus } : a));
        }

        await meetingService.updateActionStatus(item.id!, newStatus);
    };

    if (isLoading) return <div className="p-12 text-center text-slate-400">Loading Meetings...</div>;

    return (
        <div className="flex h-[calc(100vh-120px)] md:h-[calc(100vh-100px)] overflow-hidden gap-6 p-4 md:p-6 max-w-[1920px] mx-auto">
            {/* LEFT SIDEBAR: MEETING LIST */}
            <div className={`
                flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden
                md:w-72 md:flex flex-shrink-0 transition-all
                ${activeMeeting ? 'hidden' : 'w-full flex'}
            `}>
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700">Meetings</h3>
                    <button onClick={() => setIsCreating(true)} className="bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700 transition-colors">
                        <Plus className="w-4 h-4"/>
                    </button>
                </div>
                
                {isCreating && (
                    <div className="p-4 bg-indigo-50 border-b border-indigo-100 space-y-3 animate-in slide-in-from-top-2">
                        <Input placeholder="Title (e.g. Weekly Sync)" value={newMeetingTitle} onChange={e => setNewMeetingTitle(e.target.value)} className="!bg-white"/>
                        <Input type="date" value={newMeetingDate} onChange={e => setNewMeetingDate(e.target.value)} className="!bg-white"/>
                        <div className="flex gap-2">
                            <Button onClick={createMeeting} className="!py-1.5 !text-xs">Create</Button>
                            <Button variant="secondary" onClick={() => setIsCreating(false)} className="!py-1.5 !text-xs">Cancel</Button>
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {meetings.map(m => (
                        <div 
                            key={m.id} 
                            onClick={() => loadMeetingDetails(m)}
                            className={`p-3 rounded-xl cursor-pointer transition-all border ${activeMeeting?.id === m.id ? 'bg-indigo-50 border-indigo-500 shadow-sm' : 'bg-white border-transparent hover:bg-slate-50'}`}
                        >
                            <div className="font-bold text-slate-800 text-sm">{m.title}</div>
                            <div className="text-xs text-slate-500 flex justify-between items-center mt-1">
                                <span className="flex items-center gap-1"><Calendar className="w-3 h-3"/> {format(new Date(m.date), 'MMM d')}</span>
                                {m.status === 'COMPLETED' ? <Badge variant="success" className="!text-[10px] !py-0">Done</Badge> : <Badge variant="warning" className="!text-[10px] !py-0">Planned</Badge>}
                            </div>
                        </div>
                    ))}
                    {meetings.length === 0 && (
                        <div className="p-4 text-center text-slate-400 text-sm">
                            No meetings found. Tap + to create one.
                        </div>
                    )}
                </div>
            </div>

            {/* RIGHT MAIN PANEL */}
            <div className={`
                flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden
                flex-1 transition-all
                ${activeMeeting ? 'flex w-full' : 'hidden md:flex'}
            `}>
                {activeMeeting ? (
                    <div className="flex flex-col h-full">
                        {/* HEADER */}
                        <div className="p-4 md:p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50 flex-shrink-0">
                            <div className="flex items-start gap-3">
                                {/* Back Button for Mobile */}
                                <button 
                                    onClick={() => setActiveMeeting(null)} 
                                    className="md:hidden p-1 mr-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
                                >
                                    <ChevronLeft className="w-6 h-6" />
                                </button>
                                <div>
                                    <h1 className="text-xl md:text-2xl font-bold text-slate-800 leading-tight">{activeMeeting.title}</h1>
                                    <p className="text-slate-500 text-xs md:text-sm flex items-center gap-2 mt-1">
                                        <Calendar className="w-3 h-3 md:w-4 md:h-4"/> {format(new Date(activeMeeting.date), 'EEEE, MMM d')}
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                {isSuperAdmin && (
                                    <button 
                                        onClick={handleDeleteMeeting}
                                        disabled={isDeleting}
                                        className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors"
                                        title="Delete Meeting"
                                    >
                                        {isDeleting ? <Loader2 className="w-4 h-4 animate-spin"/> : <Trash2 className="w-4 h-4"/>}
                                    </button>
                                )}
                                {activeMeeting.status === 'COMPLETED' && (
                                    <Button className="!w-auto !bg-[#25D366] hover:!bg-[#20ba5a] text-white border-none shadow-md shadow-green-200 !px-3" onClick={shareMeeting} title="Share">
                                        <Share2 className="w-4 h-4 md:mr-2"/> <span className="hidden md:inline">Share</span>
                                    </Button>
                                )}
                                <Button 
                                    variant={activeMeeting.status === 'COMPLETED' ? 'primary' : 'secondary'} 
                                    className="!w-auto !px-3" 
                                    onClick={async () => {
                                        const newStatus = activeMeeting.status === 'PLANNED' ? 'COMPLETED' : 'PLANNED';
                                        setActiveMeeting({...activeMeeting, status: newStatus});
                                        setMeetings(prev => prev.map(m => m.id === activeMeeting.id ? {...m, status: newStatus} : m));
                                        await meetingService.updateMeeting(activeMeeting.id!, { status: newStatus });
                                    }}
                                >
                                    {activeMeeting.status === 'COMPLETED' ? 'Reopen' : 'Finish'}
                                </Button>
                            </div>
                        </div>

                        {/* CONTENT GRID */}
                        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
                            
                            {/* COL 1: CONTROL PANEL (Agenda + Actions) */}
                            <div className="w-full lg:w-[450px] flex-shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 overflow-y-auto bg-slate-50/50 p-4 md:p-6 space-y-6 md:space-y-8 h-1/2 lg:h-full">
                                {/* AGENDA */}
                                <section>
                                    <h3 className="font-bold text-lg text-slate-700 mb-4 flex items-center gap-2">
                                        <LayoutList className="w-5 h-5 text-indigo-500"/> Agenda
                                    </h3>
                                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-4">
                                        <div className="p-2 space-y-1">
                                            {activeMeeting.agenda.map(item => (
                                                <div key={item.id} className="flex items-start gap-3 group p-2 hover:bg-slate-50 rounded-lg transition-colors">
                                                    <Checkbox checked={item.isDiscussed} onChange={() => toggleAgendaItem(item.id)} className="mt-1" />
                                                    <div className="flex-1">
                                                        <div className={`text-sm leading-tight ${item.isDiscussed ? 'text-slate-400 line-through' : 'text-slate-700 font-medium'}`}>{item.text}</div>
                                                        <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                                                            {item.addedBy?.includes('Recurring') && <Repeat className="w-3 h-3 text-indigo-400" />}
                                                            {item.addedBy}
                                                        </div>
                                                    </div>
                                                    <button onClick={() => deleteAgendaItem(item.id)} className="text-slate-300 hover:text-red-500 md:opacity-0 md:group-hover:opacity-100 transition-opacity"><Trash2 className="w-3 h-3"/></button>
                                                </div>
                                            ))}
                                            {activeMeeting.agenda.length === 0 && <p className="text-sm text-slate-400 italic p-4 text-center">No agenda items yet.</p>}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex gap-2">
                                            <Input placeholder="Add agenda item..." value={newAgendaText} onChange={e => setNewAgendaText(e.target.value)} onKeyDown={e => e.key === 'Enter' && addAgendaItem()} className="!bg-white"/>
                                            <Button variant="secondary" className="!w-auto" onClick={addAgendaItem}><Plus className="w-4 h-4"/></Button>
                                        </div>
                                        <div className="flex items-center gap-2 pl-1">
                                            <Checkbox checked={isRecurringAgenda} onChange={(e) => setIsRecurringAgenda(e.target.checked)} />
                                            <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                                                <Repeat className="w-3 h-3"/> Add to future meetings
                                            </span>
                                        </div>
                                    </div>
                                </section>

                                {/* ACTION ITEMS */}
                                <section>
                                    <h3 className="font-bold text-lg text-slate-700 mb-4 flex items-center gap-2">
                                        <AlertTriangle className="w-5 h-5 text-indigo-500"/> Action Items
                                    </h3>
                                    
                                    {/* Carry Over */}
                                    {openGlobalActions.length > 0 && (
                                        <div className="mb-6">
                                            <div className="text-xs font-bold text-amber-600 uppercase mb-2 flex items-center gap-1"><RotateCcw className="w-3 h-3"/> Carry Over</div>
                                            <div className="space-y-2">
                                                {openGlobalActions.map(action => (
                                                    <div key={action.id} className="bg-amber-50 p-3 rounded-xl border border-amber-100 flex items-start gap-3">
                                                        <Checkbox checked={false} onChange={() => toggleActionStatus(action, true)} />
                                                        <div className="flex-1">
                                                            <div className="font-medium text-slate-800 text-sm">{action.description}</div>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <Badge variant="neutral" className="!text-[10px] bg-white border-amber-200">{action.assigneeName}</Badge>
                                                                <span className="text-[10px] text-amber-700 font-bold">Due: {action.dueDate}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* New Actions */}
                                    <div className="space-y-3">
                                        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm space-y-2">
                                            <Input placeholder="Task description..." value={newAction.description} onChange={e => setNewAction({...newAction, description: e.target.value})} className="!text-sm"/>
                                            <div className="flex gap-2">
                                                <div className="flex-1">
                                                    <Select value={newAction.assigneeId} onChange={e => setNewAction({...newAction, assigneeId: e.target.value})} className="!py-1.5 !text-sm">
                                                        <option value="">Assignee...</option>
                                                        {crew.map(c => <option key={c.id} value={c.id}>{c.crewName}</option>)}
                                                    </Select>
                                                </div>
                                                <div className="w-28">
                                                    <Input type="date" value={newAction.dueDate} onChange={e => setNewAction({...newAction, dueDate: e.target.value})} className="!py-1.5 !text-sm"/>
                                                </div>
                                            </div>
                                            <Button className="!py-1.5 !text-sm w-full" onClick={addActionItem}>Add Action</Button>
                                        </div>

                                        <div className="space-y-2">
                                            {meetingActions.map(action => (
                                                <div key={action.id} className={`p-3 rounded-xl border flex items-start gap-3 transition-all ${action.status === 'DONE' ? 'bg-emerald-50 border-emerald-100 opacity-70' : 'bg-white border-slate-100'}`}>
                                                    <Checkbox checked={action.status === 'DONE'} onChange={() => toggleActionStatus(action, false)} />
                                                    <div className="flex-1">
                                                        <div className={`text-sm font-medium ${action.status === 'DONE' ? 'text-emerald-700 line-through' : 'text-slate-800'}`}>{action.description}</div>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <Badge variant="neutral" className="!text-[10px]">{action.assigneeName}</Badge>
                                                            <span className="text-[10px] text-slate-400">Due: {action.dueDate}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </section>
                            </div>

                            {/* COL 2: MINUTES (The Document) */}
                            <div className="flex-1 flex flex-col h-1/2 lg:h-full bg-slate-100 p-4 md:p-6 lg:p-10 overflow-hidden relative">
                                <div className="absolute top-2 right-4 md:top-4 md:right-6 z-10">
                                    <Button className="!w-auto shadow-lg shadow-indigo-200 !py-1.5 !text-xs md:!py-3.5 md:!text-sm" onClick={saveNotes}>
                                        <Save className="w-3 h-3 md:w-4 md:h-4 mr-2"/> Save Minutes
                                    </Button>
                                </div>
                                
                                <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full h-full">
                                    <h3 className="font-bold text-lg text-slate-700 mb-4 flex items-center gap-2">
                                        <Type className="w-5 h-5 text-indigo-500"/> Minutes
                                    </h3>
                                    
                                    <div className="flex-1 bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden relative group">
                                        <textarea
                                            className="w-full h-full p-4 md:p-8 text-sm md:text-base text-slate-800 leading-loose resize-none focus:outline-none focus:ring-0 placeholder:text-slate-300"
                                            placeholder="Start typing meeting minutes here... (Click to edit)"
                                            value={activeMeeting.notes}
                                            onChange={e => setActiveMeeting({...activeMeeting, notes: e.target.value})}
                                            spellCheck={false}
                                        />
                                        <div className="absolute bottom-4 right-4 text-xs text-slate-300 font-medium pointer-events-none group-hover:text-slate-400 transition-colors hidden md:block">
                                            Markdown Supported • Auto-save disabled
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-300 p-8 text-center">
                        <LayoutList className="w-16 h-16 mb-4 opacity-20"/>
                        <p className="font-bold text-lg text-slate-400">Select a meeting from the list</p>
                        <p className="text-sm">or tap + to create new</p>
                    </div>
                )}
            </div>
        </div>
    );
};
