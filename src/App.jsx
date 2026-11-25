
import { useEffect, useRef, useState } from 'react'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

function getTokenClaims(token) {
  try {
    const payload = token.split('.')[1]
    if (!payload) return {}

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(normalized))
  } catch {
    return {}
  }
}

function App() {
  const [token, setToken] = useState(
    localStorage.getItem('opsflow_token') || ''
  )

  const tokenClaims = getTokenClaims(token)

  const tokenRoleValues = [
    tokenClaims.role,
    tokenClaims.roles,
    tokenClaims.authorities,
    tokenClaims.scope
  ]
    .flatMap(value => Array.isArray(value) ? value : [value])
    .filter(Boolean)
    .map(value => String(value).toUpperCase())

  const [isAdmin, setIsAdmin] = useState(
    tokenRoleValues.some(value => value.includes('ADMIN'))
  )

  // Keeps the latest Admin status available to asynchronous functions.
  const isAdminRef = useRef(
    tokenRoleValues.some(value => value.includes('ADMIN'))
  )

  const [userEmail, setUserEmail] = useState('')

  const currentUserEmail = String(
    tokenClaims.email || tokenClaims.sub || userEmail || ''
  ).toLowerCase()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [users, setUsers] = useState([])
  const [members, setMembers] = useState([])

  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [activeView, setActiveView] = useState('Overview')

  const [loading, setLoading] = useState(false)
  const [tasksLoading, setTasksLoading] = useState(false)
  const [membersLoading, setMembersLoading] = useState(false)

  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [showProjectForm, setShowProjectForm] = useState(false)
  const [showTaskForm, setShowTaskForm] = useState(false)

  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')

  const [taskTitle, setTaskTitle] = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [taskPriority, setTaskPriority] = useState('MEDIUM')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [taskAssigneeId, setTaskAssigneeId] = useState('')

  const [editingTaskId, setEditingTaskId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editStatus, setEditStatus] = useState('TODO')
  const [editPriority, setEditPriority] = useState('MEDIUM')
  const [editDueDate, setEditDueDate] = useState('')
  const [editAssigneeId, setEditAssigneeId] = useState('')

  const [taskSearch, setTaskSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [priorityFilter, setPriorityFilter] = useState('ALL')

  const [newMemberUserId, setNewMemberUserId] = useState('')
  const [memberSearch, setMemberSearch] = useState('')
  const [visibleAvailableUserCount, setVisibleAvailableUserCount] = useState(50)
  const [newMemberRole, setNewMemberRole] = useState('MANAGER')

  const sortedUsers = [...new Map(
    users.map(user => [
      String(user.email || user.id).trim().toLowerCase(),
      user
    ])
  ).values()].sort((a, b) =>
    String(a.name || a.email || '').localeCompare(
      String(b.name || b.email || ''),
      undefined,
      { sensitivity: 'base' }
    )
  )

  const selectedProject = projects.find(
    project => String(project.id) === String(selectedProjectId)
  )

  const projectMemberUserIds = new Set(
    members.map(member => String(member.userId))
  )

  const projectMemberUsers = members.map(member => ({
    id: member.userId,
    name: member.userName,
    email: member.userEmail,
    role: member.role
  })).filter(user => user.id != null)

  const canManageMembers = isAdmin || members.some(member =>
    String(member.role || '').toUpperCase() === 'MANAGER' &&
    String(member.userEmail || '').toLowerCase() === currentUserEmail
  )

  // Show every eligible user returned by the backend.
  // Do not hide accounts just because their names contain "test".
  const availableTeamUsers = sortedUsers.filter(user =>
    !projectMemberUserIds.has(String(user.id)) &&
    `${user.name || ''} ${user.email || ''} ${user.role || ''}`
      .toLowerCase()
      .includes(memberSearch.toLowerCase().trim())
  )

  const filteredTasks = tasks.filter(task => {
    const search = taskSearch.trim().toLowerCase()

    const matchesSearch =
      !search ||
      String(task.title || '').toLowerCase().includes(search) ||
      String(task.description || '').toLowerCase().includes(search) ||
      String(task.assigneeName || '').toLowerCase().includes(search) ||
      String(task.id || '').includes(search)

    return (
      matchesSearch &&
      (statusFilter === 'ALL' || task.status === statusFilter) &&
      (priorityFilter === 'ALL' || task.priority === priorityFilter)
    )
  })

  const requestHeaders = () => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  })

  const handleResponse = async response => {
    const responseText = await response.text()

    let data = null

    if (responseText) {
      try {
        data = JSON.parse(responseText)
      } catch {
        data = responseText
      }
    }

    if (!response.ok) {
      const message =
        data?.message ||
        data?.error ||
        (typeof data === 'string' ? data : '') ||
        `Request failed with status ${response.status}`

      throw new Error(message)
    }

    return data
  }

  const apiRequest = async (path, options = {}) => {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...requestHeaders(),
        ...(options.headers || {})
      }
    })

    return handleResponse(response)
  }

  const loadProjects = async () => {
    try {
      const data = await apiRequest('/api/projects')
      const projectList = Array.isArray(data) ? data : []

      setProjects(projectList)

      setSelectedProjectId(current => {
        if (
          current &&
          projectList.some(project => String(project.id) === String(current))
        ) {
          return current
        }

        return projectList.length ? String(projectList[0].id) : ''
      })
    } catch (err) {
      setError(err.message || 'Unable to load projects.')
    }
  }

  const loadUsers = async () => {
    try {
      const data = await apiRequest('/api/users')
      const userList = Array.isArray(data) ? data : []

      setUsers(userList)
      setIsAdmin(true)
      isAdminRef.current = true
    } catch (err) {
      setUsers([])

      if (err.message.includes('403')) {
        setIsAdmin(false)
        isAdminRef.current = false
      }
    }
  }

  const loadTasks = async projectId => {
    if (!projectId) {
      setTasks([])
      return
    }

    setTasksLoading(true)

    try {
      const data = await apiRequest(
        `/api/projects/${projectId}/tasks`
      )

      setTasks(Array.isArray(data) ? data : [])
    } catch (err) {
      setTasks([])
      setError(err.message || 'Unable to load tasks.')
    } finally {
      setTasksLoading(false)
    }
  }

  const loadMembers = async projectId => {
    if (!projectId) {
      setMembers([])
      return
    }

    setMembersLoading(true)

    try {
      const data = await apiRequest(
        `/api/projects/${projectId}/members`
      )

      setMembers(Array.isArray(data) ? data : [])
    } catch (err) {
      setMembers([])
      setError(err.message || 'Unable to load project members.')
    } finally {
      setMembersLoading(false)
    }
  }

  const loadAvailableUsers = async projectId => {
    if (!projectId || !isAdminRef.current) return

    try {
      const data = await apiRequest(
        `/api/projects/${projectId}/members/available-users`
      )

      setUsers(Array.isArray(data) ? data : [])
    } catch (err) {
      if (err.message.includes('403')) {
        setUsers([])
      }
    }
  }

  const refreshData = async () => {
    setError('')
    setNotice('')

    await loadProjects()
    await loadUsers()
  }

  const login = async event => {
    event.preventDefault()

    setLoading(true)
    setError('')
    setNotice('')

    try {
      const data = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      }).then(handleResponse)

      if (!data?.token) {
        throw new Error('Login response did not contain a token.')
      }

      localStorage.setItem('opsflow_token', data.token)
      setToken(data.token)
      setUserEmail(email)
      setPassword('')
      setNotice('Login successful.')
    } catch (err) {
      setError(err.message || 'Login failed. Please check your details.')
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    localStorage.removeItem('opsflow_token')

    setToken('')
    setUserEmail('')
    setEmail('')
    setPassword('')

    setProjects([])
    setTasks([])
    setUsers([])
    setMembers([])

    setSelectedProjectId('')
    setActiveView('Overview')

    setIsAdmin(false)
    isAdminRef.current = false

    setError('')
    setNotice('')
  }

  const createProject = async event => {
    event.preventDefault()

    setError('')
    setNotice('')

    try {
      await apiRequest('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: projectName,
          description: projectDescription
        })
      })

      setProjectName('')
      setProjectDescription('')
      setShowProjectForm(false)

      setNotice('Project created successfully.')
      await loadProjects()
    } catch (err) {
      setError(err.message || 'Unable to create project.')
    }
  }

  const createTask = async event => {
    event.preventDefault()

    if (!selectedProjectId) {
      setError('Please select a project first.')
      return
    }

    setError('')
    setNotice('')

    try {
      await apiRequest(
        `/api/projects/${selectedProjectId}/tasks`,
        {
          method: 'POST',
          body: JSON.stringify({
            title: taskTitle,
            description: taskDescription,
            priority: taskPriority,
            dueDate: taskDueDate || null,
            assigneeId: taskAssigneeId
              ? Number(taskAssigneeId)
              : null
          })
        }
      )

      setTaskTitle('')
      setTaskDescription('')
      setTaskPriority('MEDIUM')
      setTaskDueDate('')
      setTaskAssigneeId('')
      setShowTaskForm(false)

      setNotice('Task created successfully.')
      await loadTasks(selectedProjectId)
    } catch (err) {
      setError(err.message || 'Unable to create task.')
    }
  }

  const startEditingTask = task => {
    setEditingTaskId(task.id)
    setEditTitle(task.title || '')
    setEditDescription(task.description || '')
    setEditStatus(task.status || 'TODO')
    setEditPriority(task.priority || 'MEDIUM')
    setEditDueDate(task.dueDate || '')
    setEditAssigneeId(
      task.assigneeId == null ? '' : String(task.assigneeId)
    )
    setError('')
    setNotice('')
  }

  const cancelEditingTask = () => {
    setEditingTaskId(null)
    setEditTitle('')
    setEditDescription('')
    setEditStatus('TODO')
    setEditPriority('MEDIUM')
    setEditDueDate('')
    setEditAssigneeId('')
  }

  const updateTask = async event => {
    event.preventDefault()

    if (!editingTaskId) return

    setError('')
    setNotice('')

    try {
      await apiRequest(`/api/tasks/${editingTaskId}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: editTitle,
          description: editDescription,
          status: editStatus,
          priority: editPriority,
          dueDate: editDueDate || null,
          assigneeId: editAssigneeId
            ? Number(editAssigneeId)
            : null
        })
      })

      cancelEditingTask()
      setNotice('Task updated successfully.')

      await loadTasks(selectedProjectId)
    } catch (err) {
      setError(err.message || 'Unable to update task.')
    }
  }

  const deleteTask = async taskId => {
    if (!window.confirm('Are you sure you want to delete this task?')) {
      return
    }

    setError('')
    setNotice('')

    try {
      await apiRequest(`/api/tasks/${taskId}`, {
        method: 'DELETE'
      })

      setNotice('Task deleted successfully.')
      await loadTasks(selectedProjectId)
    } catch (err) {
      setError(err.message || 'Unable to delete task.')
    }
  }

  const addProjectMember = async event => {
    event.preventDefault()

    if (!selectedProjectId || !newMemberUserId) {
      setError('Please select a user to add.')
      return
    }

    setError('')
    setNotice('')

    try {
      await apiRequest(
        `/api/projects/${selectedProjectId}/members`,
        {
          method: 'POST',
          body: JSON.stringify({
            userId: Number(newMemberUserId),
            role: newMemberRole
          })
        }
      )

      setNewMemberUserId('')
      setMemberSearch('')
      setVisibleAvailableUserCount(50)
      setNewMemberRole('MANAGER')

      setNotice('Project member added successfully.')

      await loadMembers(selectedProjectId)
      await loadAvailableUsers(selectedProjectId)
    } catch (err) {
      setError(err.message || 'Unable to add project member.')
    }
  }

  const removeProjectMember = async member => {
    if (
      !window.confirm(
        `Remove ${member.userName || 'this user'} from the project?`
      )
    ) {
      return
    }

    setError('')
    setNotice('')

    try {
      await apiRequest(
        `/api/projects/${selectedProjectId}/members/${member.id}`,
        {
          method: 'DELETE'
        }
      )

      setNotice(
        `${member.userName || 'Member'} removed from the project.`
      )

      await loadMembers(selectedProjectId)
      await loadAvailableUsers(selectedProjectId)
    } catch (err) {
      setError(err.message || 'Unable to remove project member.')
    }
  }

  useEffect(() => {
    if (!token) return

    loadProjects()
    loadUsers()
  }, [token])

  useEffect(() => {
    if (!token || !selectedProjectId) return

    loadTasks(selectedProjectId)
    loadMembers(selectedProjectId)
  }, [token, selectedProjectId])

  useEffect(() => {
    if (!token || !selectedProjectId || !isAdmin) return

    loadAvailableUsers(selectedProjectId)
  }, [token, selectedProjectId, isAdmin])

  if (!token) {
    return (
      <main className="login-page">
        <section className="login-card">
          <div className="login-brand">
            <div className="brand-mark">O</div>
            <div>
              <h1>OpsFlow</h1>
              <p>Work better together</p>
            </div>
          </div>

          <h2>Welcome back</h2>
          <p className="login-subtitle">
            Sign in to continue to your workspace.
          </p>

          {error && (
            <div className="alert error-alert">
              {error}
            </div>
          )}

          {notice && (
            <div className="alert success-alert">
              {notice}
            </div>
          )}

          <form onSubmit={login}>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
            />

            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />

            <button
              className="primary-button login-button"
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">O</div>
          <div>
            <h1>OpsFlow</h1>
            <p>WORK BETTER TOGETHER</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          {[
            'Overview',
            'Projects',
            'Tasks',
            'Team Members'
          ].map(view => (
            <button
              key={view}
              className={
                activeView === view
                  ? 'nav-item active'
                  : 'nav-item'
              }
              onClick={() => {
                setActiveView(view)
                setError('')
                setNotice('')
              }}
            >
              {view === 'Overview' && '▦'}
              {view === 'Projects' && '▣'}
              {view === 'Tasks' && '☷'}
              {view === 'Team Members' && '♙'}
              <span>{view}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <div className="user-avatar">
              {(currentUserEmail || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="sidebar-user-info">
              <strong>{currentUserEmail || 'User'}</strong>
              <span>{isAdmin ? 'Admin' : 'Workspace member'}</span>
            </div>
          </div>

          <button
            className="logout-button"
            onClick={logout}
          >
            Log out
          </button>
        </div>
      </aside>

      <section className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">YOUR WORKSPACE</p>
            <h2>
              {activeView}
            </h2>
          </div>

          <button
            className="outline-button"
            onClick={refreshData}
          >
            ↻ Refresh
          </button>
        </header>

        {error && (
          <div className="alert error-alert">
            {error}
          </div>
        )}

        {notice && (
          <div className="alert success-alert">
            {notice}
          </div>
        )}

        {activeView === 'Overview' && (
          <section className="page-section">
            <div className="welcome-card">
              <div>
                <p className="eyebrow">WORK BETTER TOGETHER</p>
                <h1>Welcome to OpsFlow!</h1>
                <p>
                  Your workspace for managing projects, tasks and teams.
                </p>
              </div>
              <div className="welcome-decoration">O</div>
            </div>

            <div className="stats-grid">
              <article className="stat-card">
                <span className="stat-icon">▣</span>
                <p>Total projects</p>
                <h2>{projects.length}</h2>
              </article>

              <article className="stat-card">
                <span className="stat-icon">☷</span>
                <p>Total tasks</p>
                <h2>{tasks.length}</h2>
              </article>

              <article className="stat-card">
                <span className="stat-icon">♙</span>
                <p>Project members</p>
                <h2>{members.length}</h2>
              </article>
            </div>

            <div className="section-heading">
              <div>
                <p className="eyebrow">WORKSPACE</p>
                <h2>Your projects</h2>
              </div>
              <button
                className="outline-button"
                onClick={() => setActiveView('Projects')}
              >
                View projects
              </button>
            </div>

            {projects.length === 0 ? (
              <div className="empty-state">
                <h3>No projects yet</h3>
                <p>Create a project to get started.</p>
              </div>
            ) : (
              <div className="project-grid">
                {projects.slice(0, 4).map(project => (
                  <article
                    className="project-card"
                    key={project.id}
                  >
                    <div className="project-card-icon">▣</div>
                    <h3>{project.name}</h3>
                    <p>
                      {project.description || 'No description provided.'}
                    </p>
                    <button
                      className="text-link"
                      onClick={() => {
                        setSelectedProjectId(String(project.id))
                        setActiveView('Tasks')
                      }}
                    >
                      View tasks ↗
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {activeView === 'Projects' && (
          <section className="page-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">WORKSPACE</p>
                <h2>Projects</h2>
              </div>

              <button
                className="primary-button"
                onClick={() => setShowProjectForm(value => !value)}
              >
                {showProjectForm ? 'Cancel' : '+ New project'}
              </button>
            </div>

            {showProjectForm && (
              <form
                className="task-form"
                onSubmit={createProject}
              >
                <h3>Create a project</h3>

                <label htmlFor="projectName">Project name</label>
                <input
                  id="projectName"
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  placeholder="Enter project name"
                  required
                />

                <label htmlFor="projectDescription">
                  Description
                </label>
                <textarea
                  id="projectDescription"
                  value={projectDescription}
                  onChange={e => setProjectDescription(e.target.value)}
                  placeholder="Describe your project"
                  rows="3"
                />

                <div className="form-actions">
                  <button className="primary-button">
                    Create project
                  </button>
                </div>
              </form>
            )}

            {projects.length === 0 ? (
              <div className="empty-state">
                <h3>No projects found</h3>
                <p>Create your first project.</p>
              </div>
            ) : (
              <div className="project-grid">
                {projects.map(project => (
                  <article
                    className="project-card"
                    key={project.id}
                  >
                    <div className="project-card-icon">▣</div>
                    <h3>{project.name}</h3>
                    <p>
                      {project.description || 'No description provided.'}
                    </p>

                    <div className="project-card-actions">
                      <button
                        className="text-link"
                        onClick={() => {
                          setSelectedProjectId(String(project.id))
                          setActiveView('Tasks')
                        }}
                      >
                        View tasks ↗
                      </button>

                      <button
                        className="text-link"
                        onClick={() => {
                          setSelectedProjectId(String(project.id))
                          setActiveView('Team Members')
                        }}
                      >
                        Team ↗
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {activeView === 'Tasks' && (
          <section className="page-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">PROJECT WORK</p>
                <h2>Tasks</h2>
              </div>

              <button
                className="primary-button"
                onClick={() => setShowTaskForm(value => !value)}
              >
                {showTaskForm ? 'Cancel' : '+ New task'}
              </button>
            </div>

            <div className="project-selector">
              <label htmlFor="taskProject">Project</label>
              <select
                id="taskProject"
                value={selectedProjectId}
                onChange={e => setSelectedProjectId(e.target.value)}
              >
                {projects.map(project => (
                  <option
                    key={project.id}
                    value={String(project.id)}
                  >
                    {project.name || `Project #${project.id}`}
                  </option>
                ))}
              </select>
            </div>

            {showTaskForm && (
              <form
                className="task-form"
                onSubmit={createTask}
              >
                <h3>Create a task</h3>

                <div className="task-form-grid">
                  <div>
                    <label htmlFor="taskTitle">Task title</label>
                    <input
                      id="taskTitle"
                      value={taskTitle}
                      onChange={e => setTaskTitle(e.target.value)}
                      placeholder="Enter task title"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="taskPriority">Priority</label>
                    <select
                      id="taskPriority"
                      value={taskPriority}
                      onChange={e => setTaskPriority(e.target.value)}
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="taskDueDate">Due date</label>
                    <input
                      id="taskDueDate"
                      type="date"
                      value={taskDueDate}
                      onChange={e => setTaskDueDate(e.target.value)}
                    />
                  </div>

                  <div>
                    <label htmlFor="taskAssignee">Assign to</label>
                    <select
                      id="taskAssignee"
                      value={taskAssigneeId}
                      onChange={e => setTaskAssigneeId(e.target.value)}
                    >
                      <option value="">Unassigned</option>
                      {projectMemberUsers.map(user => (
                        <option
                          key={user.id}
                          value={String(user.id)}
                        >
                          {user.name || user.email}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <label htmlFor="taskDescription">Description</label>
                <textarea
                  id="taskDescription"
                  value={taskDescription}
                  onChange={e => setTaskDescription(e.target.value)}
                  placeholder="Describe the task"
                  rows="3"
                />

                <div className="form-actions">
                  <button className="primary-button">
                    Create task
                  </button>
                </div>
              </form>
            )}

            <div className="filter-bar">
              <input
                type="search"
                placeholder="Search tasks..."
                value={taskSearch}
                onChange={e => setTaskSearch(e.target.value)}
              />

              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                <option value="ALL">All statuses</option>
                <option value="TODO">To do</option>
                <option value="IN_PROGRESS">In progress</option>
                <option value="DONE">Done</option>
              </select>

              <select
                value={priorityFilter}
                onChange={e => setPriorityFilter(e.target.value)}
              >
                <option value="ALL">All priorities</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>

            {tasksLoading ? (
              <div className="empty-state">
                <h3>Loading tasks...</h3>
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="empty-state">
                <h3>No tasks found</h3>
                <p>Try changing your search or filters.</p>
              </div>
            ) : (
              <div className="task-list">
                {filteredTasks.map(task => (
                  <article
                    className="task-card"
                    key={task.id}
                  >
                    {editingTaskId === task.id ? (
                      <form
                        className="task-edit-form"
                        onSubmit={updateTask}
                      >
                        <h3>Edit task</h3>

                        <label htmlFor={`editTitle-${task.id}`}>
                          Task title
                        </label>
                        <input
                          id={`editTitle-${task.id}`}
                          value={editTitle}
                          onChange={e => setEditTitle(e.target.value)}
                          required
                        />

                        <label htmlFor={`editDescription-${task.id}`}>
                          Description
                        </label>
                        <textarea
                          id={`editDescription-${task.id}`}
                          value={editDescription}
                          onChange={e =>
                            setEditDescription(e.target.value)
                          }
                          rows="3"
                        />

                        <div className="task-form-grid">
                          <div>
                            <label htmlFor={`editStatus-${task.id}`}>
                              Status
                            </label>
                            <select
                              id={`editStatus-${task.id}`}
                              value={editStatus}
                              onChange={e =>
                                setEditStatus(e.target.value)
                              }
                            >
                              <option value="TODO">To do</option>
                              <option value="IN_PROGRESS">
                                In progress
                              </option>
                              <option value="DONE">Done</option>
                            </select>
                          </div>

                          <div>
                            <label htmlFor={`editPriority-${task.id}`}>
                              Priority
                            </label>
                            <select
                              id={`editPriority-${task.id}`}
                              value={editPriority}
                              onChange={e =>
                                setEditPriority(e.target.value)
                              }
                            >
                              <option value="LOW">Low</option>
                              <option value="MEDIUM">Medium</option>
                              <option value="HIGH">High</option>
                            </select>
                          </div>

                          <div>
                            <label htmlFor={`editDueDate-${task.id}`}>
                              Due date
                            </label>
                            <input
                              id={`editDueDate-${task.id}`}
                              type="date"
                              value={editDueDate}
                              onChange={e =>
                                setEditDueDate(e.target.value)
                              }
                            />
                          </div>

                          <div>
                            <label htmlFor={`editAssignee-${task.id}`}>
                              Assign to
                            </label>
                            <select
                              id={`editAssignee-${task.id}`}
                              value={editAssigneeId}
                              onChange={e =>
                                setEditAssigneeId(e.target.value)
                              }
                            >
                              <option value="">Unassigned</option>
                              {projectMemberUsers.map(user => (
                                <option
                                  key={user.id}
                                  value={String(user.id)}
                                >
                                  {user.name || user.email}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="form-actions">
                          <button className="primary-button">
                            Save changes
                          </button>

                          <button
                            type="button"
                            className="outline-button"
                            onClick={cancelEditingTask}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <div className="task-card-main">
                          <div className="task-title-row">
                            <h3>{task.title}</h3>
                            <span className="priority-pill">
                              {task.priority || 'MEDIUM'}
                            </span>
                          </div>

                          <p className="task-description">
                            {task.description || 'No description provided.'}
                          </p>

                          <div className="task-meta">
                            <span>
                              Status: {task.status || 'TODO'}
                            </span>
                            <span>
                              Assignee: {task.assigneeName || 'Unassigned'}
                            </span>
                            <span>
                              Due: {task.dueDate || 'Not set'}
                            </span>
                          </div>
                        </div>

                        <div className="task-card-actions">
                          <button
                            className="outline-button"
                            onClick={() => startEditingTask(task)}
                          >
                            Edit
                          </button>

                          <button
                            className="danger-button"
                            onClick={() => deleteTask(task.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {activeView === 'Team Members' && (
          <section className="page-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">PROJECT ACCESS</p>
                <h2>Team Members</h2>
                <p>
                  Manage who can participate in this project and assign
                  their project role.
                </p>
              </div>

              <button
                className="outline-button"
                onClick={() => {
                  loadMembers(selectedProjectId)
                  loadAvailableUsers(selectedProjectId)
                }}
              >
                ↻ Refresh
              </button>
            </div>

            <div className="project-selector">
              <label htmlFor="memberProject">Project</label>
              <select
                id="memberProject"
                value={selectedProjectId}
                onChange={e => {
                  setSelectedProjectId(e.target.value)
                  setNewMemberUserId('')
                  setMemberSearch('')
                  setVisibleAvailableUserCount(50)
                }}
              >
                {projects.map(project => (
                  <option
                    key={project.id}
                    value={String(project.id)}
                  >
                    {project.name || `Project #${project.id}`}
                  </option>
                ))}
              </select>

              <span className="task-count">
                {members.length}{' '}
                {members.length === 1 ? 'member' : 'members'}
              </span>
            </div>

            {!projects.length ? (
              <div className="empty-state">
                <div className="empty-icon">▦</div>

                <h3>Create a project first</h3>

                <p>
                  Project members are managed separately for each project.
                </p>

                <button
                  className="outline-button"
                  onClick={() => setActiveView('Projects')}
                >
                  Go to Projects
                </button>
              </div>
            ) : (
              <>
                {canManageMembers && (
                  <form
                    className="task-form"
                    onSubmit={addProjectMember}
                  >
                    <h3>Add a team member</h3>

                    <div className="task-form-grid">
                      <div>
                        <label htmlFor="memberSearch">
                          Search users by name, email or role
                        </label>

                        <input
                          id="memberSearch"
                          type="search"
                          placeholder="Type a name, email or role..."
                          value={memberSearch}
                          onChange={e => {
                            setMemberSearch(e.target.value)
                            setVisibleAvailableUserCount(50)
                            setNewMemberUserId('')
                          }}
                        />

                        <small className="member-search-count">
                          Showing {Math.min(
                            availableTeamUsers.length,
                            visibleAvailableUserCount
                          )} of {availableTeamUsers.length} available users.
                          Search to narrow the list.
                        </small>

                        <label htmlFor="newMemberUser">
                          Choose user
                        </label>

                        <select
                          id="newMemberUser"
                          value={newMemberUserId}
                          onChange={e =>
                            setNewMemberUserId(e.target.value)
                          }
                          required
                        >
                          <option value="">Select a user</option>

                          {availableTeamUsers
                            .slice(0, visibleAvailableUserCount)
                            .map(user => (
                              <option
                                key={user.id}
                                value={String(user.id)}
                              >
                                {user.name || user.email}

                                {user.email && user.name
                                  ? ` — ${user.email}`
                                  : ''}

                                {' '}({user.role || 'User'})
                              </option>
                            ))}
                        </select>

                        {availableTeamUsers.length === 0 && (
                          <small>
                            No available users match your search.
                          </small>
                        )}

                        {availableTeamUsers.length >
                          visibleAvailableUserCount && (
                          <button
                            type="button"
                            className="outline-button"
                            onClick={() =>
                              setVisibleAvailableUserCount(
                                count => count + 50
                              )
                            }
                          >
                            Show 50 more users
                          </button>
                        )}
                      </div>

                      <div>
                        <label htmlFor="newMemberRole">
                          Project role
                        </label>

                        <select
                          id="newMemberRole"
                          value={newMemberRole}
                          onChange={e =>
                            setNewMemberRole(e.target.value)
                          }
                        >
                          <option value="MANAGER">Manager</option>
                          <option value="DEVELOPER">Developer</option>
                          <option value="TESTER">Tester</option>
                        </select>
                      </div>
                    </div>

                    <div className="form-actions">
                      <button
                        className="primary-button"
                        disabled={!newMemberUserId || membersLoading}
                      >
                        Add member
                      </button>
                    </div>
                  </form>
                )}

                <div className="section-heading">
                  <div>
                    <p className="eyebrow">PROJECT ACCESS</p>
                    <h2>Current members</h2>
                  </div>
                </div>

                {membersLoading ? (
                  <div className="empty-state">
                    <h3>Loading members...</h3>
                  </div>
                ) : members.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">♙</div>

                    <h3>No members found</h3>

                    <p>
                      Add a user above to make them a member of this project.
                    </p>
                  </div>
                ) : (
                  <div className="task-list">
                    {members.map(member => (
                      <article
                        className="task-card"
                        key={member.id}
                      >
                        <div className="task-card-main">
                          <div className="task-title-row">
                            <h3>
                              {member.userName ||
                                `User #${member.userId}`}
                            </h3>

                            <span className="priority-pill">
                              {member.role || 'MEMBER'}
                            </span>
                          </div>

                          <p className="task-description">
                            {member.userEmail || 'No email provided'}
                          </p>

                          <div className="task-meta">
                            <span>User ID: {member.userId}</span>
                            <span>Project member ID: {member.id}</span>
                          </div>
                        </div>

                        {canManageMembers && (
                          <div className="task-card-actions">
                            <button
                              className="danger-button"
                              onClick={() => removeProjectMember(member)}
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        <footer className="app-footer">
          OpsFlow · Your work, flowing forward.
        </footer>
      </section>
    </main>
  )
}

export default App
