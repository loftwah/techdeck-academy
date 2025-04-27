# TODO: Define outputs for created resources

# output "eks_cluster_endpoint" {
#   description = "Endpoint for EKS control plane"
#   value       = module.eks.cluster_endpoint # Adjust based on module output
# }

# output "eks_cluster_ca_certificate" {
#   description = "Base64 encoded certificate data required to communicate with the cluster"
#   value       = module.eks.cluster_certificate_authority_data # Adjust based on module output
# }

# output "eks_cluster_name" {
#   description = "Kubernetes Cluster Name"
#   value       = module.eks.cluster_id # Adjust based on module output
# }

# output "rds_instance_endpoint" {
#   description = "Endpoint of the RDS instance"
#   value       = aws_db_instance.default.endpoint # Adjust based on resource name
#   sensitive = true
# }

# output "rds_instance_port" {
#   description = "Port of the RDS instance"
#   value       = aws_db_instance.default.port # Adjust based on resource name
# }

# output "s3_bucket_id" {
#   description = "ID (name) of the S3 bucket"
#   value       = aws_s3_bucket.default.id # Adjust based on resource name
# }

# output "s3_bucket_arn" {
#   description = "ARN of the S3 bucket"
#   value       = aws_s3_bucket.default.arn # Adjust based on resource name
# } 