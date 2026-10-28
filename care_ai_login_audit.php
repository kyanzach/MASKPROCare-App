<?php
/**
 * MaskPro Care — AI Helper Login Audit & Security Monitor
 * Dedicated administrative review interface for AI verification sessions,
 * identity score evaluations, anti-fishing detection, and IP blacklisting.
 */

require_once 'session_check.php';
require_once 'db_config.php';

// Flash messages
$success_message = $_SESSION['success_message'] ?? '';
$error_message = $_SESSION['error_message'] ?? '';
unset($_SESSION['success_message'], $_SESSION['error_message']);

// ─── POST Actions: Block / Unblock IP ───────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (isset($_POST['action_block_ip'])) {
        $ip_to_block = trim($_POST['ip_address'] ?? '');
        $reason = trim($_POST['block_reason'] ?? 'Manual administrative block');
        $duration_hours = (int)($_POST['duration_hours'] ?? 0); // 0 = permanent

        if (!filter_var($ip_to_block, FILTER_VALIDATE_IP)) {
            $_SESSION['error_message'] = 'Invalid IP address format.';
        } else {
            $blocked_until = $duration_hours > 0 ? date('Y-m-d H:i:s', strtotime("+{$duration_hours} hours")) : null;
            $stmt = $conn->prepare("INSERT INTO care_blocked_ips (ip_address, reason, blocked_until, attempts_count, created_at, updated_at) 
                                    VALUES (?, ?, ?, 1, NOW(), NOW()) 
                                    ON DUPLICATE KEY UPDATE reason = VALUES(reason), blocked_until = VALUES(blocked_until), updated_at = NOW()");
            $stmt->bind_param("sss", $ip_to_block, $reason, $blocked_until);
            $stmt->execute();
            $stmt->close();
            $_SESSION['success_message'] = "IP address {$ip_to_block} has been blocked successfully.";
        }
        header("Location: care_ai_login_audit.php");
        exit;
    }

    if (isset($_POST['action_unblock_ip'])) {
        $ip_to_unblock = trim($_POST['ip_address'] ?? '');
        if (!empty($ip_to_unblock)) {
            $stmt = $conn->prepare("DELETE FROM care_blocked_ips WHERE ip_address = ?");
            $stmt->bind_param("s", $ip_to_unblock);
            $stmt->execute();
            $stmt->close();
            $_SESSION['success_message'] = "IP address {$ip_to_unblock} unblocked.";
        }
        header("Location: care_ai_login_audit.php");
        exit;
    }
}

// ─── Summary Statistics ─────────────────────────────────────────────
$stats = [
    'today_sessions' => 0,
    'today_verified' => 0,
    'total_verified' => 0,
    'flagged_fishing' => 0,
    'active_blocked_ips' => 0,
];

$res = $conn->query("SELECT 
    COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END) as today_sessions,
    COUNT(CASE WHEN DATE(created_at) = CURDATE() AND status = 'success' THEN 1 END) as today_verified,
    COUNT(CASE WHEN status = 'success' THEN 1 END) as total_verified,
    COUNT(CASE WHEN status = 'flagged_fishing' THEN 1 END) as flagged_fishing
    FROM care_ai_login_logs");
if ($row = $res->fetch_assoc()) {
    $stats['today_sessions'] = (int)$row['today_sessions'];
    $stats['today_verified'] = (int)$row['today_verified'];
    $stats['total_verified'] = (int)$row['total_verified'];
    $stats['flagged_fishing'] = (int)$row['flagged_fishing'];
}

$res_ips = $conn->query("SELECT COUNT(*) as cnt FROM care_blocked_ips WHERE blocked_until IS NULL OR blocked_until > NOW()");
if ($row_ip = $res_ips->fetch_assoc()) {
    $stats['active_blocked_ips'] = (int)$row_ip['cnt'];
}

// ─── Filter & Search ────────────────────────────────────────────────
$filter_status = trim($_GET['status'] ?? 'all');
$search_query = trim($_GET['q'] ?? '');

$where_clauses = ["1=1"];
$params = [];
$types = "";

if ($filter_status === 'verified') {
    $where_clauses[] = "l.status = 'success'";
} elseif ($filter_status === 'failed') {
    $where_clauses[] = "l.status = 'failed'";
} elseif ($filter_status === 'flagged') {
    $where_clauses[] = "l.status = 'flagged_fishing'";
}

if (!empty($search_query)) {
    $where_clauses[] = "(l.claimed_name LIKE ? OR l.claimed_mobile LIKE ? OR l.ip_address LIKE ? OR c.full_name LIKE ?)";
    $term = "%{$search_query}%";
    $params = array_merge($params, [$term, $term, $term, $term]);
    $types .= "ssss";
}

$where_sql = implode(" AND ", $where_clauses);

// Fetch logs
$sql = "SELECT l.*, c.full_name as actual_customer_name, c.mobile_number as actual_mobile,
               b.id as is_blocked
        FROM care_ai_login_logs l
        LEFT JOIN customers c ON l.customer_id = c.id
        LEFT JOIN care_blocked_ips b ON l.ip_address = b.ip_address AND (b.blocked_until IS NULL OR b.blocked_until > NOW())
        WHERE {$where_sql}
        ORDER BY l.id DESC
        LIMIT 100";

$stmt = $conn->prepare($sql);
if (!empty($types)) {
    $stmt->bind_param($types, ...$params);
}
$stmt->execute();
$logs_result = $stmt->get_result();

// Fetch currently blocked IPs
$blocked_ips_res = $conn->query("SELECT * FROM care_blocked_ips ORDER BY id DESC LIMIT 50");

include('header-meta-title.php');
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <title>AI Login Security Monitor | MaskPro Unify</title>
    <?php include('header_general_required_css.php'); ?>
    <style>
        .audit-card {
            border-radius: 12px;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
            margin-bottom: 24px;
            overflow: hidden;
        }
        .stat-card {
            padding: 20px;
            border-radius: 12px;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .stat-icon {
            width: 48px;
            height: 48px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
        }
        .badge-verified {
            background-color: #dcfce7;
            color: #15803d;
            border: 1px solid #bbf7d0;
            padding: 4px 10px;
            border-radius: 20px;
            font-weight: 600;
            font-size: 12px;
        }
        .badge-failed {
            background-color: #fee2e2;
            color: #b91c1c;
            border: 1px solid #fecaca;
            padding: 4px 10px;
            border-radius: 20px;
            font-weight: 600;
            font-size: 12px;
        }
        .badge-flagged {
            background-color: #fef3c7;
            color: #b45309;
            border: 1px solid #fde68a;
            padding: 4px 10px;
            border-radius: 20px;
            font-weight: 600;
            font-size: 12px;
        }
        .score-pill {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 700;
        }
        .score-high { background: #dcfce7; color: #166534; }
        .score-mid  { background: #fef3c7; color: #92400e; }
        .score-low  { background: #fee2e2; color: #991b1b; }
    </style>
</head>
<body>
    <div class="page-wrapper">
        <?php include('body_menu.php'); ?>
        <div class="page-content">
            <div class="container-fluid">
                
                <!-- Breadcrumb -->
                <div class="row">
                    <div class="col-12">
                        <div class="page-title-box d-flex align-items-center justify-content-between">
                            <div>
                                <h4 class="mb-1" style="font-weight: 700; color: #1e293b;">
                                    <i class="fas fa-robot text-primary me-2"></i> Care App — AI Login Security Monitor
                                </h4>
                                <p class="text-muted mb-0" style="font-size: 13px;">Review conversational identity verifications, anti-fishing detections, and manage blocked IP addresses.</p>
                            </div>
                            <div>
                                <button class="btn btn-danger btn-sm" data-bs-toggle="modal" data-bs-target="#modalManualBlock">
                                    <i class="fas fa-ban me-1"></i> Block IP Manually
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Alerts -->
                <?php if ($success_message): ?>
                    <div class="alert alert-success alert-dismissible fade show" role="alert">
                        <i class="fas fa-check-circle me-1"></i> <?= htmlspecialchars($success_message) ?>
                        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                    </div>
                <?php endif; ?>
                <?php if ($error_message): ?>
                    <div class="alert alert-danger alert-dismissible fade show" role="alert">
                        <i class="fas fa-exclamation-triangle me-1"></i> <?= htmlspecialchars($error_message) ?>
                        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                    </div>
                <?php endif; ?>

                <!-- Stats Overview Cards -->
                <div class="row mb-4">
                    <div class="col-md-3 col-sm-6 mb-3">
                        <div class="stat-card">
                            <div>
                                <div class="text-muted small fw-semibold">TODAY'S VERIFICATIONS</div>
                                <h3 class="mb-0 mt-1 fw-bold text-dark"><?= number_format($stats['today_sessions']) ?></h3>
                                <div class="small text-success mt-1">
                                    <i class="fas fa-check"></i> <?= $stats['today_verified'] ?> successfully verified
                                </div>
                            </div>
                            <div class="stat-icon" style="background: rgba(14, 165, 233, 0.1); color: #0284c7;">
                                <i class="fas fa-user-check"></i>
                            </div>
                        </div>
                    </div>

                    <div class="col-md-3 col-sm-6 mb-3">
                        <div class="stat-card">
                            <div>
                                <div class="text-muted small fw-semibold">TOTAL SUCCESSFUL LOGINS</div>
                                <h3 class="mb-0 mt-1 fw-bold text-success"><?= number_format($stats['total_verified']) ?></h3>
                                <div class="small text-muted mt-1">Over 90% confidence threshold</div>
                            </div>
                            <div class="stat-icon" style="background: rgba(34, 197, 94, 0.1); color: #16a34a;">
                                <i class="fas fa-shield-alt"></i>
                            </div>
                        </div>
                    </div>

                    <div class="col-md-3 col-sm-6 mb-3">
                        <div class="stat-card">
                            <div>
                                <div class="text-muted small fw-semibold">FLAGGED FISHING ATTEMPTS</div>
                                <h3 class="mb-0 mt-1 fw-bold text-warning"><?= number_format($stats['flagged_fishing']) ?></h3>
                                <div class="small text-muted mt-1">Multi-name scans from same IP</div>
                            </div>
                            <div class="stat-icon" style="background: rgba(245, 158, 11, 0.1); color: #d97706;">
                                <i class="fas fa-user-secret"></i>
                            </div>
                        </div>
                    </div>

                    <div class="col-md-3 col-sm-6 mb-3">
                        <div class="stat-card">
                            <div>
                                <div class="text-muted small fw-semibold">BLOCKED IP ADDRESSES</div>
                                <h3 class="mb-0 mt-1 fw-bold text-danger"><?= number_format($stats['active_blocked_ips']) ?></h3>
                                <div class="small text-muted mt-1">Currently blacklisted networks</div>
                            </div>
                            <div class="stat-icon" style="background: rgba(239, 68, 68, 0.1); color: #dc2626;">
                                <i class="fas fa-ban"></i>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Navigation Tabs & Search -->
                <div class="audit-card p-3 mb-4">
                    <div class="row align-items-center">
                        <div class="col-md-7 mb-2 mb-md-0">
                            <ul class="nav nav-pills">
                                <li class="nav-item">
                                    <a class="nav-link <?= $filter_status === 'all' ? 'active' : '' ?>" href="care_ai_login_audit.php?status=all<?= !empty($search_query) ? '&q='.urlencode($search_query) : '' ?>">All Activity</a>
                                </li>
                                <li class="nav-item">
                                    <a class="nav-link <?= $filter_status === 'verified' ? 'active' : '' ?>" href="care_ai_login_audit.php?status=verified<?= !empty($search_query) ? '&q='.urlencode($search_query) : '' ?>">Verified (Passed)</a>
                                </li>
                                <li class="nav-item">
                                    <a class="nav-link <?= $filter_status === 'failed' ? 'active' : '' ?>" href="care_ai_login_audit.php?status=failed<?= !empty($search_query) ? '&q='.urlencode($search_query) : '' ?>">Failed (<90%)</a>
                                </li>
                                <li class="nav-item">
                                    <a class="nav-link <?= $filter_status === 'flagged' ? 'active' : '' ?>" href="care_ai_login_audit.php?status=flagged<?= !empty($search_query) ? '&q='.urlencode($search_query) : '' ?>">Flagged Fishing</a>
                                </li>
                            </ul>
                        </div>
                        <div class="col-md-5">
                            <form method="GET" action="care_ai_login_audit.php" class="d-flex gap-2">
                                <input type="hidden" name="status" value="<?= htmlspecialchars($filter_status) ?>">
                                <input type="text" name="q" value="<?= htmlspecialchars($search_query) ?>" class="form-control form-control-sm" placeholder="Search by name, mobile, or IP...">
                                <button type="submit" class="btn btn-primary btn-sm px-3">Search</button>
                                <?php if (!empty($search_query)): ?>
                                    <a href="care_ai_login_audit.php?status=<?= htmlspecialchars($filter_status) ?>" class="btn btn-outline-secondary btn-sm">Clear</a>
                                <?php endif; ?>
                            </form>
                        </div>
                    </div>
                </div>

                <!-- Verification Log Table -->
                <div class="audit-card">
                    <div class="p-3 border-bottom d-flex justify-content-between align-items-center">
                        <h6 class="mb-0 fw-bold text-dark">
                            <i class="fas fa-list me-1 text-primary"></i> Verification Activity Log
                        </h6>
                        <span class="text-muted small">Showing latest attempts</span>
                    </div>

                    <div class="table-responsive">
                        <table class="table table-hover align-middle mb-0">
                            <thead class="table-light">
                                <tr>
                                    <th style="font-size: 12px;">DATE & TIME</th>
                                    <th style="font-size: 12px;">CLAIMED IDENTITY</th>
                                    <th style="font-size: 12px;">MATCHED CUSTOMER</th>
                                    <th style="font-size: 12px;">IP & DEVICE</th>
                                    <th style="font-size: 12px;" class="text-center">CONFIDENCE</th>
                                    <th style="font-size: 12px;" class="text-center">STATUS</th>
                                    <th style="font-size: 12px;" class="text-end">ACTIONS</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php if ($logs_result->num_rows > 0): ?>
                                    <?php while ($log = $logs_result->fetch_assoc()): ?>
                                        <?php 
                                            $details = json_decode($log['details'] ?? '{}', true);
                                            $answers = $details['answers'] ?? [];
                                            $breakdown = $details['breakdown'] ?? [];
                                            $score = (float)$log['score'];
                                            $score_cls = $score >= 90 ? 'score-high' : ($score >= 60 ? 'score-mid' : 'score-low');
                                        ?>
                                        <tr>
                                            <td style="font-size: 13px;">
                                                <div class="fw-semibold text-dark"><?= date('M j, Y', strtotime($log['created_at'])) ?></div>
                                                <div class="text-muted small"><?= date('g:i:s A', strtotime($log['created_at'])) ?></div>
                                            </td>
                                            <td style="font-size: 13px;">
                                                <div class="fw-bold text-dark"><?= htmlspecialchars($log['claimed_name'] ?: 'None') ?></div>
                                                <div class="text-muted small"><i class="fas fa-phone me-1"></i><?= htmlspecialchars($log['claimed_mobile'] ?: 'N/A') ?></div>
                                            </td>
                                            <td style="font-size: 13px;">
                                                <?php if (!empty($log['customer_id'])): ?>
                                                    <div class="text-primary fw-semibold">
                                                        <a href="customers_edit.php?id=<?= $log['customer_id'] ?>" target="_blank" class="text-decoration-none">
                                                            <?= htmlspecialchars($log['actual_customer_name'] ?: "ID #{$log['customer_id']}") ?>
                                                        </a>
                                                    </div>
                                                    <div class="text-muted small"><?= htmlspecialchars($log['actual_mobile'] ?: '') ?></div>
                                                <?php else: ?>
                                                    <span class="text-muted fst-italic">No match found</span>
                                                <?php endif; ?>
                                            </td>
                                            <td style="font-size: 13px;">
                                                <div>
                                                    <code class="text-dark"><?= htmlspecialchars($log['ip_address']) ?></code>
                                                    <?php if ($log['is_blocked']): ?>
                                                        <span class="badge bg-danger ms-1" style="font-size: 10px;">BLOCKED</span>
                                                    <?php endif; ?>
                                                </div>
                                                <div class="text-muted small"><?= htmlspecialchars($log['device'] ?: 'Web') ?></div>
                                            </td>
                                            <td class="text-center">
                                                <span class="score-pill <?= $score_cls ?>"><?= number_format($score, 1) ?>%</span>
                                            </td>
                                            <td class="text-center">
                                                <?php if ($log['status'] === 'success'): ?>
                                                    <span class="badge-verified"><i class="fas fa-check me-1"></i>Verified</span>
                                                <?php elseif ($log['status'] === 'flagged_fishing'): ?>
                                                    <span class="badge-flagged"><i class="fas fa-exclamation-triangle me-1"></i>Flagged</span>
                                                <?php else: ?>
                                                    <span class="badge-failed"><i class="fas fa-times me-1"></i>Failed</span>
                                                <?php endif; ?>
                                            </td>
                                            <td class="text-end">
                                                <div class="d-flex justify-content-end gap-1">
                                                    <!-- Inspect Modal Trigger -->
                                                    <button type="button" class="btn btn-sm btn-outline-info" 
                                                            onclick="openInspectModal(<?= htmlspecialchars(json_encode([
                                                                'id' => $log['id'],
                                                                'date' => date('M j, Y g:i A', strtotime($log['created_at'])),
                                                                'claimed_name' => $log['claimed_name'],
                                                                'claimed_mobile' => $log['claimed_mobile'],
                                                                'actual_name' => $log['actual_customer_name'],
                                                                'actual_mobile' => $log['actual_mobile'],
                                                                'ip' => $log['ip_address'],
                                                                'device' => $log['device'],
                                                                'score' => $score,
                                                                'status' => $log['status'],
                                                                'answers' => $answers,
                                                                'breakdown' => $breakdown
                                                            ])) ?>)">
                                                        <i class="fas fa-eye"></i> Details
                                                    </button>

                                                    <?php if ($log['is_blocked']): ?>
                                                        <form method="POST" onsubmit="return confirm('Unblock IP <?= htmlspecialchars($log['ip_address']) ?>?');" style="display:inline;">
                                                            <input type="hidden" name="action_unblock_ip" value="1">
                                                            <input type="hidden" name="ip_address" value="<?= htmlspecialchars($log['ip_address']) ?>">
                                                            <button type="submit" class="btn btn-sm btn-outline-success">Unblock</button>
                                                        </form>
                                                    <?php else: ?>
                                                        <button type="button" class="btn btn-sm btn-outline-danger" 
                                                                onclick="openBlockModal('<?= htmlspecialchars($log['ip_address']) ?>')">
                                                            Block IP
                                                        </button>
                                                    <?php endif; ?>
                                                </div>
                                            </td>
                                        </tr>
                                    <?php endwhile; ?>
                                <?php else: ?>
                                    <tr>
                                        <td colspan="7" class="text-center py-4 text-muted">
                                            <i class="fas fa-inbox fa-2x mb-2 d-block text-secondary"></i>
                                            No AI login activity found matching the criteria.
                                        </td>
                                    </tr>
                                <?php endif; ?>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Blocked IPs Section -->
                <div class="audit-card mt-4">
                    <div class="p-3 border-bottom d-flex justify-content-between align-items-center">
                        <h6 class="mb-0 fw-bold text-dark">
                            <i class="fas fa-shield-virus me-1 text-danger"></i> Currently Blacklisted IP Addresses
                        </h6>
                        <span class="badge bg-danger"><?= $blocked_ips_res->num_rows ?> Blocked</span>
                    </div>
                    <div class="table-responsive">
                        <table class="table table-hover align-middle mb-0">
                            <thead class="table-light">
                                <tr>
                                    <th style="font-size: 12px;">IP ADDRESS</th>
                                    <th style="font-size: 12px;">REASON</th>
                                    <th style="font-size: 12px;">ATTEMPTS</th>
                                    <th style="font-size: 12px;">BLOCKED UNTIL</th>
                                    <th style="font-size: 12px;" class="text-end">ACTION</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php if ($blocked_ips_res->num_rows > 0): ?>
                                    <?php while ($bip = $blocked_ips_res->fetch_assoc()): ?>
                                        <tr>
                                            <td><code><?= htmlspecialchars($bip['ip_address']) ?></code></td>
                                            <td style="font-size: 13px;"><?= htmlspecialchars($bip['reason']) ?></td>
                                            <td><span class="badge bg-secondary"><?= (int)$bip['attempts_count'] ?></span></td>
                                            <td style="font-size: 12px;">
                                                <?= $bip['blocked_until'] ? date('M j, Y g:i A', strtotime($bip['blocked_until'])) : '<span class="badge bg-dark">Permanent</span>' ?>
                                            </td>
                                            <td class="text-end">
                                                <form method="POST" onsubmit="return confirm('Unblock IP <?= htmlspecialchars($bip['ip_address']) ?>?');" style="display:inline;">
                                                    <input type="hidden" name="action_unblock_ip" value="1">
                                                    <input type="hidden" name="ip_address" value="<?= htmlspecialchars($bip['ip_address']) ?>">
                                                    <button type="submit" class="btn btn-sm btn-outline-success">Unblock IP</button>
                                                </form>
                                            </td>
                                        </tr>
                                    <?php endwhile; ?>
                                <?php else: ?>
                                    <tr>
                                        <td colspan="5" class="text-center py-3 text-muted">No IP addresses are currently blocked.</td>
                                    </tr>
                                <?php endif; ?>
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        </div>
        <?php include('footer.php'); ?>
    </div>

    <!-- Manual Block IP Modal -->
    <div class="modal fade" id="modalManualBlock" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog">
            <div class="modal-content">
                <form method="POST">
                    <input type="hidden" name="action_block_ip" value="1">
                    <div class="modal-header">
                        <h5 class="modal-title fw-bold"><i class="fas fa-ban text-danger me-2"></i>Block IP Address</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-3">
                            <label class="form-label fw-semibold">IP Address *</label>
                            <input type="text" name="ip_address" id="block_modal_ip" class="form-control" placeholder="e.g. 192.168.1.100" required>
                        </div>
                        <div class="mb-3">
                            <label class="form-label fw-semibold">Block Reason</label>
                            <input type="text" name="block_reason" class="form-control" placeholder="e.g. Suspicious credential guessing" value="Manual administrative block">
                        </div>
                        <div class="mb-3">
                            <label class="form-label fw-semibold">Duration</label>
                            <select name="duration_hours" class="form-select">
                                <option value="1">1 Hour</option>
                                <option value="24">24 Hours</option>
                                <option value="72">3 Days</option>
                                <option value="0" selected>Permanent (Until manually unblocked)</option>
                            </select>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="submit" class="btn btn-danger">Confirm Block</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <!-- Inspect Verification Modal -->
    <div class="modal fade" id="sessionInspectModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header bg-light">
                    <h5 class="modal-title fw-bold" id="inspect_title">
                        <i class="fas fa-shield-alt text-primary me-2"></i> Verification Details
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body" id="inspect_body">
                    <!-- Populated via JavaScript -->
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                </div>
            </div>
        </div>
    </div>

    <?php include('footer_general_required_script.php'); ?>
    <script>
        function openBlockModal(ip) {
            document.getElementById('block_modal_ip').value = ip;
            var modal = new bootstrap.Modal(document.getElementById('modalManualBlock'));
            modal.show();
        }

        function openInspectModal(data) {
            var answers = data.answers || {};
            var breakdown = data.breakdown || {};

            var html = `
                <div class="row mb-3">
                    <div class="col-md-6">
                        <div class="p-2 border rounded bg-light">
                            <div class="small text-muted fw-bold">CLAIMED DETAILS</div>
                            <div><strong>Name:</strong> ${data.claimed_name || 'N/A'}</div>
                            <div><strong>Mobile:</strong> ${data.claimed_mobile || 'N/A'}</div>
                            <div><strong>Booking Month:</strong> ${answers.booking_month || 'N/A'}</div>
                            <div><strong>Service:</strong> ${answers.booked_service || 'N/A'}</div>
                            <div><strong>Vehicle:</strong> ${answers.vehicle_model || 'N/A'}</div>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="p-2 border rounded bg-light">
                            <div class="small text-muted fw-bold">MATCHED DATABASE RECORD</div>
                            <div><strong>Customer:</strong> ${data.actual_name || '<span class="text-danger">Not Found</span>'}</div>
                            <div><strong>Registered Mobile:</strong> ${data.actual_mobile || 'N/A'}</div>
                            <div><strong>IP Address:</strong> <code>${data.ip}</code></div>
                            <div><strong>Device:</strong> ${data.device || 'N/A'}</div>
                            <div><strong>Date:</strong> ${data.date}</div>
                        </div>
                    </div>
                </div>

                <h6 class="fw-bold mt-3 mb-2">5-Identifier Score Breakdown (Passing: >= 90%):</h6>
                <div class="table-responsive">
                    <table class="table table-bordered table-sm text-center">
                        <thead class="table-light">
                            <tr>
                                <th>Full Name (25%)</th>
                                <th>Booking Month (25%)</th>
                                <th>Service (20%)</th>
                                <th>Vehicle Model (15%)</th>
                                <th>Mobile Number (15%)</th>
                                <th class="table-primary">TOTAL SCORE</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>${breakdown.name?.score ?? 0} / 25</td>
                                <td>${breakdown.booking_month?.score ?? 0} / 25</td>
                                <td>${breakdown.service?.score ?? 0} / 20</td>
                                <td>${breakdown.vehicle?.score ?? 0} / 15</td>
                                <td>${breakdown.mobile?.score ?? 0} / 15</td>
                                <td class="table-primary fw-bold fs-6">${data.score}%</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            `;

            document.getElementById('inspect_body').innerHTML = html;
            var modal = new bootstrap.Modal(document.getElementById('sessionInspectModal'));
            modal.show();
        }
    </script>
</body>
</html>
